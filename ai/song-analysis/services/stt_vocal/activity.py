"""Energy-based singing activity detection for an already separated vocal stem.

This is intentionally not called VAD: it cannot distinguish speech/singing from
other loud sources.  It is safe in this pipeline because it runs after source
separation and keeps every interval on the original audio timeline.
"""

from __future__ import annotations

from array import array
from dataclasses import dataclass
from math import log10, sqrt
from pathlib import Path
import sys
import wave


@dataclass(frozen=True, slots=True)
class ActivityConfig:
    frame_ms: int = 30
    minimum_active_ms: int = 180
    bridge_silence_ms: int = 550
    padding_ms: int = 300
    minimum_threshold_dbfs: float = -55.0
    maximum_threshold_dbfs: float = -25.0


@dataclass(frozen=True, slots=True)
class ActivityResult:
    intervals: tuple[tuple[float, float], ...]
    threshold_dbfs: float
    duration: float

    def whisper_clip_timestamps(self) -> list[float]:
        return [value for pair in self.intervals for value in pair]


@dataclass(frozen=True, slots=True)
class EnergyProfile:
    """Fine-grained RMS samples used to find the release of a sung syllable.

    Values are normalized to full-scale PCM (``0.0`` to roughly ``1.0``).
    Each value describes a window whose centre is
    ``time_offset_seconds + index * hop_seconds`` on the original timeline.
    """

    rms: tuple[float, ...]
    duration: float
    frame_seconds: float
    hop_seconds: float
    time_offset_seconds: float
    global_threshold: float

    @property
    def threshold_dbfs(self) -> float:
        if self.global_threshold <= 0:
            return -100.0
        return 20.0 * log10(self.global_threshold)


def _pcm16_rms(data: bytes) -> float:
    samples = array("h")
    samples.frombytes(data)
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples:
        return 0.0
    return sqrt(sum(sample * sample for sample in samples) / len(samples))


def _percentile(values: list[float], fraction: float) -> float:
    if not values:
        return -100.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * fraction)))
    return ordered[index]


def analyze_pcm16_energy(
    path: str | Path,
    *,
    frame_ms: int = 40,
    hop_ms: int = 10,
) -> EnergyProfile:
    """Build an overlapping RMS profile from an uncompressed PCM16 WAV.

    Channel samples are squared together instead of first being downmixed, so
    opposite-phase stereo vocals cannot cancel each other. The adaptive global
    threshold follows the held-note heuristic used later by post-processing;
    individual syllables additionally derive a quieter local threshold.
    """

    if frame_ms <= 0 or hop_ms <= 0:
        raise ValueError("energy frame and hop sizes must be positive")
    if hop_ms > frame_ms:
        raise ValueError("energy hop size cannot exceed the frame size")

    path = Path(path)
    with wave.open(str(path), "rb") as audio:
        if audio.getcomptype() != "NONE" or audio.getsampwidth() != 2:
            raise ValueError(
                "energy analysis requires an uncompressed 16-bit PCM WAV vocal stem"
            )
        sample_rate = audio.getframerate()
        channels = audio.getnchannels()
        total_frames = audio.getnframes()
        raw_samples = audio.readframes(total_frames)

    duration = total_frames / sample_rate
    window_frames = max(1, round(sample_rate * frame_ms / 1000))
    hop_frames = max(1, round(sample_rate * hop_ms / 1000))
    frame_seconds = window_frames / sample_rate
    hop_seconds = hop_frames / sample_rate
    if total_frames <= 0:
        return EnergyProfile(
            rms=(),
            duration=duration,
            frame_seconds=frame_seconds,
            hop_seconds=hop_seconds,
            time_offset_seconds=frame_seconds / 2.0,
            global_threshold=0.0,
        )

    samples = array("h")
    samples.frombytes(raw_samples)
    del raw_samples
    if sys.byteorder != "little":
        samples.byteswap()

    start_frame = 0
    end_frame = min(total_frames, window_frames)
    start_sample = 0
    end_sample = end_frame * channels
    square_sum = sum(value * value for value in samples[start_sample:end_sample])
    rms_values: list[float] = []

    while start_frame < total_frames:
        sample_count = max(1, (end_frame - start_frame) * channels)
        rms_values.append(sqrt(square_sum / sample_count) / 32768.0)

        next_start = start_frame + hop_frames
        if next_start >= total_frames:
            break
        next_end = min(total_frames, next_start + window_frames)

        if next_start <= end_frame:
            outgoing_start = start_frame * channels
            outgoing_end = next_start * channels
            incoming_start = end_frame * channels
            incoming_end = next_end * channels
            square_sum -= sum(
                value * value for value in samples[outgoing_start:outgoing_end]
            )
            square_sum += sum(
                value * value for value in samples[incoming_start:incoming_end]
            )
        else:
            next_start_sample = next_start * channels
            next_end_sample = next_end * channels
            square_sum = sum(
                value * value for value in samples[next_start_sample:next_end_sample]
            )

        start_frame = next_start
        end_frame = next_end

    level_60 = _percentile(rms_values, 0.60)
    voiced = [value for value in rms_values if value > 0 and value >= level_60]
    voiced_median = _percentile(voiced, 0.50) if voiced else 0.0
    global_threshold = 0.18 * max(0.0, voiced_median)
    return EnergyProfile(
        rms=tuple(rms_values),
        duration=duration,
        frame_seconds=frame_seconds,
        hop_seconds=hop_seconds,
        time_offset_seconds=frame_seconds / 2.0,
        global_threshold=global_threshold,
    )


def detect_vocal_activity(
    path: str | Path, config: ActivityConfig | None = None
) -> ActivityResult:
    """Detect energetic regions in a 16-bit PCM WAV vocal stem.

    Raises a descriptive error for compressed/float WAV files.  Callers should
    then fall back to full-track transcription rather than silently changing
    the source timeline.
    """

    config = config or ActivityConfig()
    path = Path(path)
    with wave.open(str(path), "rb") as audio:
        if audio.getcomptype() != "NONE" or audio.getsampwidth() != 2:
            raise ValueError(
                "activity detection requires an uncompressed 16-bit PCM WAV vocal stem"
            )
        sample_rate = audio.getframerate()
        channels = audio.getnchannels()
        total_frames = audio.getnframes()
        frames_per_window = max(1, round(sample_rate * config.frame_ms / 1000))
        dbfs: list[float] = []
        while True:
            chunk = audio.readframes(frames_per_window)
            if not chunk:
                break
            rms = _pcm16_rms(chunk)
            dbfs.append(20.0 * log10(max(rms, 1e-5) / 32768.0))

    duration = total_frames / sample_rate
    if not dbfs:
        return ActivityResult((), config.minimum_threshold_dbfs, duration)

    noise_floor = _percentile(dbfs, 0.20)
    active_level = _percentile(dbfs, 0.90)
    adaptive = noise_floor + 0.38 * max(0.0, active_level - noise_floor)
    threshold = max(
        config.minimum_threshold_dbfs,
        min(config.maximum_threshold_dbfs, adaptive),
    )
    active = [value >= threshold for value in dbfs]

    bridge_frames = max(0, round(config.bridge_silence_ms / config.frame_ms))
    index = 0
    while index < len(active):
        if active[index]:
            index += 1
            continue
        end = index
        while end < len(active) and not active[end]:
            end += 1
        if index > 0 and end < len(active) and end - index <= bridge_frames:
            active[index:end] = [True] * (end - index)
        index = end

    minimum_frames = max(1, round(config.minimum_active_ms / config.frame_ms))
    pad_seconds = config.padding_ms / 1000.0
    frame_seconds = config.frame_ms / 1000.0
    intervals: list[tuple[float, float]] = []
    index = 0
    while index < len(active):
        if not active[index]:
            index += 1
            continue
        end = index
        while end < len(active) and active[end]:
            end += 1
        if end - index >= minimum_frames:
            start_time = max(0.0, index * frame_seconds - pad_seconds)
            end_time = min(duration, end * frame_seconds + pad_seconds)
            if intervals and start_time <= intervals[-1][1]:
                intervals[-1] = (intervals[-1][0], max(intervals[-1][1], end_time))
            else:
                intervals.append((start_time, end_time))
        index = end

    return ActivityResult(
        intervals=tuple((round(start, 3), round(end, 3)) for start, end in intervals),
        threshold_dbfs=round(threshold, 2),
        duration=duration,
    )
