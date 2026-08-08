from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import librosa
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.ndimage import maximum_filter1d, median_filter
from scipy.signal import find_peaks


@dataclass
class AnalysisConfig:
    sample_rate: int = 16000
    hop_ms: int = 10
    frame_length: int = 1536
    fmin_note: str = "C2"
    fmax_note: str = "C6"

    # F0 / voiced 정제
    min_voiced_probability: float = 0.58
    weak_voiced_probability: float = 0.22
    rms_margin_db: float = 13.0
    weak_rms_margin_db: float = 7.0
    voiced_pre_roll_ms: int = 25
    voiced_post_roll_ms: int = 70
    max_interpolation_gap_ms: int = 140
    max_candidate_recovery_gap_ms: int = 1100
    long_candidate_recovery_ms: int = 500
    long_candidate_min_voiced_ratio: float = 0.70
    unconditional_gap_fill_ms: int = 45
    max_bridge_pitch_jump_cents: float = 280.0
    max_candidate_boundary_cents: float = 300.0
    voiced_release_ms: int = 120
    median_filter_ms: int = 35
    min_note_rms_db: float = -55.0

    # 음절형 노트 경계
    min_note_ms: int = 90
    preferred_min_note_ms: int = 130
    max_note_gap_ms: int = 70
    note_change_cents: float = 110.0
    pitch_change_hold_ms: int = 80
    onset_delta: float = 0.12
    onset_wait_ms: int = 90
    onset_backtrack_ms: int = 30
    min_onset_strength: float = 0.18
    energy_rise_db: float = 3.0
    same_pitch_onset_min_gap_ms: int = 150
    soft_onset_local_window_ms: int = 1500
    soft_onset_min_strength: float = 0.06
    soft_onset_ratio: float = 0.40
    soft_onset_prominence: float = 0.20
    soft_onset_long_segment_ms: int = 700
    soft_onset_edge_gap_ms: int = 150
    short_note_merge_ms: int = 110
    merge_pitch_cents: float = 90.0




def hz_to_midi_float(f0_hz: np.ndarray) -> np.ndarray:
    result = np.full_like(f0_hz, np.nan, dtype=float)
    valid = np.isfinite(f0_hz) & (f0_hz > 0)
    result[valid] = 69.0 + 12.0 * np.log2(f0_hz[valid] / 440.0)
    return result


def robust_noise_floor_db(rms_db: np.ndarray) -> float:
    finite = rms_db[np.isfinite(rms_db)]
    if finite.size == 0:
        return -60.0
    lower = finite[finite <= np.percentile(finite, 25)]
    return float(np.median(lower if lower.size else finite))


def masked_median_filter(values: np.ndarray, size: int) -> np.ndarray:
    if size <= 1:
        return values.copy()
    result = values.copy()
    valid = np.isfinite(values)
    if not np.any(valid):
        return result
    filled = values.copy()
    idx = np.arange(len(values))
    filled[~valid] = np.interp(idx[~valid], idx[valid], values[valid])
    filtered = median_filter(filled, size=size, mode="nearest")
    result[valid] = filtered[valid]
    return result


def expand_weak_around_strong(
    strong: np.ndarray,
    candidate: np.ndarray,
    pre_frames: int,
    post_frames: int,
) -> np.ndarray:
    if not np.any(strong):
        return strong.copy()
    expanded = strong.copy()
    for idx in np.flatnonzero(strong):
        left = max(0, idx - pre_frames)
        right = min(len(strong), idx + post_frames + 1)
        expanded[left:right] |= candidate[left:right]
    return expanded


def hysteresis_voiced_mask(
    strong: np.ndarray,
    weak: np.ndarray,
    release_frames: int,
) -> np.ndarray:
    """Keep a voiced region alive through short weak-confidence dips."""
    result = np.zeros_like(strong, dtype=bool)
    active = False
    misses = 0
    for i in range(len(strong)):
        if strong[i]:
            active = True
            misses = 0
            result[i] = True
        elif active and weak[i]:
            misses = 0
            result[i] = True
        elif active:
            misses += 1
            if misses <= release_frames:
                result[i] = True
            else:
                active = False
                misses = 0

    # Reverse pass recovers quiet consonant/attack frames immediately before a strong frame.
    active = False
    misses = 0
    for i in range(len(strong) - 1, -1, -1):
        if strong[i]:
            active = True
            misses = 0
            result[i] = True
        elif active and weak[i]:
            misses = 0
            result[i] = True
        elif active:
            misses += 1
            if misses <= release_frames:
                result[i] = True
            else:
                active = False
                misses = 0
    return result


def fill_short_mask_gaps(mask: np.ndarray, max_gap_frames: int) -> np.ndarray:
    """Close short false gaps only when both sides belong to voiced regions."""
    result = mask.copy()
    i = 0
    while i < len(result):
        if result[i]:
            i += 1
            continue
        start = i
        while i < len(result) and not result[i]:
            i += 1
        end = i
        if (
            0 < end - start <= max_gap_frames
            and start > 0
            and end < len(result)
            and result[start - 1]
            and result[end]
        ):
            result[start:end] = True
    return result


def bridge_pitch_gaps(
    values: np.ndarray,
    allowed: np.ndarray,
    max_gap_frames: int,
    max_jump_semitones: float,
) -> np.ndarray:
    result = values.copy()
    valid = np.isfinite(result)
    idx = np.arange(len(result))
    i = 0
    while i < len(result):
        if valid[i]:
            i += 1
            continue
        start = i
        while i < len(result) and not valid[i]:
            i += 1
        end = i
        gap = end - start
        if not (
            0 < gap <= max_gap_frames
            and start > 0
            and end < len(result)
            and valid[start - 1]
            and valid[end]
            and np.mean(allowed[start:end]) >= 0.5
        ):
            continue
        left = 69.0 + 12.0 * np.log2(result[start - 1] / 440.0)
        right = 69.0 + 12.0 * np.log2(result[end] / 440.0)
        if abs(right - left) > max_jump_semitones:
            continue
        midi = np.interp(idx[start:end], [start - 1, end], [left, right])
        result[start:end] = 440.0 * (2.0 ** ((midi - 69.0) / 12.0))
        valid[start:end] = True
    return result


def recover_short_candidate_gaps(
    values: np.ndarray,
    candidates: np.ndarray,
    allowed: np.ndarray,
    candidate_voiced: np.ndarray,
    max_gap_frames: int,
    long_gap_frames: int,
    long_gap_min_voiced_ratio: float,
    max_boundary_semitones: float,
) -> np.ndarray:
    """Recover bounded pYIN dropouts when its hidden candidate joins both sides."""
    result = values.copy()
    valid = np.isfinite(result)
    i = 0
    while i < len(result):
        if valid[i]:
            i += 1
            continue
        start = i
        while i < len(result) and not valid[i]:
            i += 1
        end = i
        gap = end - start
        if not (
            0 < gap <= max_gap_frames
            and start > 0
            and end < len(result)
            and valid[start - 1]
            and valid[end]
            and np.mean(allowed[start:end]) >= 0.5
        ):
            continue
        if (
            gap >= long_gap_frames
            and np.mean(candidate_voiced[start:end]) < long_gap_min_voiced_ratio
        ):
            continue

        candidate_hz = candidates[start:end]
        if not np.all(np.isfinite(candidate_hz)) or np.any(candidate_hz <= 0):
            continue
        candidate_midi = hz_to_midi_float(candidate_hz)
        smooth_size = min(5, gap if gap % 2 else gap - 1)
        if smooth_size >= 3:
            candidate_midi = median_filter(
                candidate_midi,
                size=smooth_size,
                mode="nearest",
            )

        left_midi = float(hz_to_midi_float(np.asarray([result[start - 1]]))[0])
        right_midi = float(hz_to_midi_float(np.asarray([result[end]]))[0])
        edge_frames = min(3, gap)
        candidate_left = float(np.median(candidate_midi[:edge_frames]))
        candidate_right = float(np.median(candidate_midi[-edge_frames:]))
        if (
            abs(candidate_left - left_midi) > max_boundary_semitones
            or abs(candidate_right - right_midi) > max_boundary_semitones
        ):
            continue

        result[start:end] = 440.0 * (
            2.0 ** ((candidate_midi - 69.0) / 12.0)
        )
        valid[start:end] = True
    return result


def normalize_feature(values: np.ndarray) -> np.ndarray:
    x = np.asarray(values, dtype=float)
    finite = x[np.isfinite(x)]
    if finite.size == 0:
        return np.zeros_like(x)
    lo, hi = np.percentile(finite, [10, 95])
    if hi <= lo + 1e-9:
        return np.zeros_like(x)
    return np.clip((x - lo) / (hi - lo), 0.0, 1.0)


def analyze_frames(audio_path: Path, cfg: AnalysisConfig) -> tuple[pd.DataFrame, np.ndarray]:
    audio, sr = librosa.load(audio_path, sr=cfg.sample_rate, mono=True)
    hop_length = max(1, round(sr * cfg.hop_ms / 1000))

    candidate_f0, voiced_flag_pyin, voiced_probability = librosa.pyin(
        audio,
        fmin=librosa.note_to_hz(cfg.fmin_note),
        fmax=librosa.note_to_hz(cfg.fmax_note),
        sr=sr,
        frame_length=cfg.frame_length,
        hop_length=hop_length,
        center=True,
        fill_na=None,
    )
    rms = librosa.feature.rms(
        y=audio,
        frame_length=cfg.frame_length,
        hop_length=hop_length,
        center=True,
    )[0]
    onset_env = librosa.onset.onset_strength(
        y=audio,
        sr=sr,
        hop_length=hop_length,
        aggregate=np.median,
    )

    length = min(len(candidate_f0), len(rms), len(voiced_probability), len(onset_env))
    candidate_f0 = candidate_f0[:length]
    rms = rms[:length]
    voiced_probability = voiced_probability[:length]
    voiced_flag_pyin = voiced_flag_pyin[:length]
    onset_env = onset_env[:length]
    f0 = np.asarray(candidate_f0, dtype=float).copy()
    f0[~voiced_flag_pyin.astype(bool)] = np.nan

    rms_db = librosa.amplitude_to_db(rms, ref=1.0)
    noise_floor_db = robust_noise_floor_db(rms_db)
    strong_threshold_db = max(noise_floor_db + cfg.rms_margin_db, cfg.min_note_rms_db + 5)
    weak_threshold_db = max(noise_floor_db + cfg.weak_rms_margin_db, cfg.min_note_rms_db)

    strong = (
        np.isfinite(f0)
        & (voiced_probability >= cfg.min_voiced_probability)
        & (rms_db >= strong_threshold_db)
    )
    weak = (
        np.isfinite(f0)
        & (voiced_probability >= cfg.weak_voiced_probability)
        & (rms_db >= weak_threshold_db)
    )
    expanded = expand_weak_around_strong(
        strong,
        weak,
        round(cfg.voiced_pre_roll_ms / cfg.hop_ms),
        round(cfg.voiced_post_roll_ms / cfg.hop_ms),
    )
    reliable = hysteresis_voiced_mask(
        strong,
        weak | expanded,
        max(1, round(cfg.voiced_release_ms / cfg.hop_ms)),
    )
    reliable = fill_short_mask_gaps(
        reliable,
        max(1, round(cfg.unconditional_gap_fill_ms / cfg.hop_ms)),
    )

    cleaned_f0 = f0.copy()
    cleaned_f0[~reliable] = np.nan
    allowed_bridge = (rms_db >= weak_threshold_db - 3.0) & (
        (voiced_probability >= 0.06)
        | voiced_flag_pyin.astype(bool)
        | reliable
    )
    before_candidate_recovery = cleaned_f0.copy()
    cleaned_f0 = recover_short_candidate_gaps(
        cleaned_f0,
        np.asarray(candidate_f0, dtype=float),
        allowed_bridge,
        voiced_flag_pyin.astype(bool),
        max(1, round(cfg.max_candidate_recovery_gap_ms / cfg.hop_ms)),
        max(1, round(cfg.long_candidate_recovery_ms / cfg.hop_ms)),
        cfg.long_candidate_min_voiced_ratio,
        cfg.max_candidate_boundary_cents / 100.0,
    )
    candidate_recovered = (
        ~np.isfinite(before_candidate_recovery) & np.isfinite(cleaned_f0)
    )
    long_candidate_recovered = np.zeros(length, dtype=bool)
    minimum_long_recovery = max(1, round(cfg.long_candidate_recovery_ms / cfg.hop_ms))
    i = 0
    while i < length:
        if not candidate_recovered[i]:
            i += 1
            continue
        start = i
        while i < length and candidate_recovered[i]:
            i += 1
        if i - start >= minimum_long_recovery:
            long_candidate_recovered[start:i] = True
    cleaned_f0 = bridge_pitch_gaps(
        cleaned_f0,
        allowed_bridge,
        max(1, round(cfg.max_interpolation_gap_ms / cfg.hop_ms)),
        cfg.max_bridge_pitch_jump_cents / 100.0,
    )

    median_size = max(1, round(cfg.median_filter_ms / cfg.hop_ms))
    median_size += 1 - median_size % 2
    smoothed_f0 = masked_median_filter(cleaned_f0, median_size)
    midi_pitch = hz_to_midi_float(cleaned_f0)
    smoothed_midi = hz_to_midi_float(smoothed_f0)

    onset_norm = normalize_feature(onset_env)
    energy_rise = np.diff(rms_db, prepend=rms_db[0])
    energy_rise_norm = normalize_feature(np.maximum(energy_rise, 0.0))
    syllable_strength = np.clip(0.72 * onset_norm + 0.28 * energy_rise_norm, 0.0, 1.0)

    frames = pd.DataFrame(
        {
            "time_ms": (np.arange(length) * cfg.hop_ms).astype(int),
            "f0_hz_raw": f0,
            "f0_hz": cleaned_f0,
            "midi_pitch": midi_pitch,
            "smoothed_midi": smoothed_midi,
            "confidence": voiced_probability,
            "candidate_recovered": candidate_recovered,
            "long_candidate_recovered": long_candidate_recovered,
            "rms_db": rms_db,
            "voiced": np.isfinite(cleaned_f0),
            "onset_strength": onset_norm,
            "energy_rise_db": energy_rise,
            "syllable_strength": syllable_strength,
        }
    )
    frames.attrs.update(
        noise_floor_db=noise_floor_db,
        strong_threshold_db=strong_threshold_db,
        weak_threshold_db=weak_threshold_db,
    )
    return frames, audio


def split_voiced_regions(voiced: np.ndarray, max_gap_frames: int) -> list[tuple[int, int]]:
    regions: list[tuple[int, int]] = []
    i, n = 0, len(voiced)
    while i < n:
        while i < n and not voiced[i]:
            i += 1
        if i >= n:
            break
        start, last_voiced, gap = i, i, 0
        i += 1
        while i < n:
            if voiced[i]:
                last_voiced, gap = i, 0
            else:
                gap += 1
                if gap > max_gap_frames:
                    break
            i += 1
        regions.append((start, last_voiced + 1))
    return regions


def detect_onset_boundaries(frames: pd.DataFrame, cfg: AnalysisConfig) -> set[int]:
    strength = frames["syllable_strength"].to_numpy(float)
    voiced = frames["voiced"].to_numpy(bool)
    rms_rise = frames["energy_rise_db"].to_numpy(float)
    wait = max(1, round(cfg.onset_wait_ms / cfg.hop_ms))

    peaks, _ = find_peaks(
        strength,
        height=cfg.min_onset_strength,
        distance=wait,
        prominence=cfg.onset_delta,
    )
    boundaries: set[int] = set()
    backtrack = max(0, round(cfg.onset_backtrack_ms / cfg.hop_ms))
    for p in peaks:
        left = max(0, p - backtrack)
        candidate = p
        local = np.flatnonzero(voiced[left : p + 1])
        if local.size:
            candidate = left + int(local[0])
        if voiced[min(candidate, len(voiced) - 1)] or rms_rise[p] >= cfg.energy_rise_db:
            boundaries.add(candidate)
    return boundaries


def detect_soft_onset_boundaries(frames: pd.DataFrame, cfg: AnalysisConfig) -> set[int]:
    """Find quiet syllable attacks relative to their local vocal phrase."""
    strength = frames["syllable_strength"].to_numpy(float)
    voiced = frames["voiced"].to_numpy(bool)
    local_window = max(3, round(cfg.soft_onset_local_window_ms / cfg.hop_ms))
    local_window += 1 - local_window % 2
    local_peak = maximum_filter1d(strength, size=local_window, mode="nearest")
    adaptive_strength = strength / np.maximum(local_peak, cfg.soft_onset_min_strength)
    distance = max(1, round(cfg.same_pitch_onset_min_gap_ms / cfg.hop_ms))
    peaks, _ = find_peaks(
        adaptive_strength,
        height=cfg.soft_onset_ratio,
        distance=distance,
        prominence=cfg.soft_onset_prominence,
    )

    boundaries: set[int] = set()
    backtrack = max(0, round(cfg.onset_backtrack_ms / cfg.hop_ms))
    for p in peaks:
        if strength[p] < cfg.soft_onset_min_strength:
            continue
        left = max(0, p - backtrack)
        local = np.flatnonzero(voiced[left : p + 1])
        candidate = left + int(local[0]) if local.size else p
        if voiced[min(candidate, len(voiced) - 1)]:
            boundaries.add(candidate)
    return boundaries


def detect_pitch_boundaries(frames: pd.DataFrame, cfg: AnalysisConfig) -> set[int]:
    pitch = frames["smoothed_midi"].to_numpy(float)
    voiced = frames["voiced"].to_numpy(bool)
    long_recovered = frames["long_candidate_recovered"].to_numpy(bool)
    hold = max(2, round(cfg.pitch_change_hold_ms / cfg.hop_ms))
    threshold = cfg.note_change_cents / 100.0
    boundaries: set[int] = set()

    for i in range(hold, len(pitch) - hold):
        if not voiced[i]:
            continue
        if np.any(long_recovered[i - hold : i + hold]):
            continue
        left = pitch[i - hold : i]
        right = pitch[i : i + hold]
        left = left[np.isfinite(left)]
        right = right[np.isfinite(right)]
        if len(left) < hold // 2 or len(right) < hold // 2:
            continue
        if abs(float(np.median(right)) - float(np.median(left))) >= threshold:
            boundaries.add(i)
    return boundaries


def representative_pitch(pitch: np.ndarray) -> float:
    valid = pitch[np.isfinite(pitch)]
    if valid.size == 0:
        return float("nan")
    # 시작/끝의 자음·슬라이드 영향을 줄이기 위해 중앙부 우선 사용
    if valid.size >= 8:
        cut = max(1, int(valid.size * 0.15))
        core = valid[cut:-cut] if len(valid) > 2 * cut else valid
    else:
        core = valid
    return float(np.median(core))


def make_raw_segments(frames: pd.DataFrame, cfg: AnalysisConfig) -> list[tuple[int, int, str]]:
    voiced = frames["voiced"].to_numpy(bool)
    pitch = frames["smoothed_midi"].to_numpy(float)
    long_recovered = frames["long_candidate_recovered"].to_numpy(bool)
    onset_boundaries = detect_onset_boundaries(frames, cfg)
    soft_onset_boundaries = detect_soft_onset_boundaries(frames, cfg)
    pitch_boundaries = detect_pitch_boundaries(frames, cfg)
    max_gap = max(1, round(cfg.max_note_gap_ms / cfg.hop_ms))
    regions = split_voiced_regions(voiced, max_gap)
    min_same_pitch_gap = max(1, round(cfg.same_pitch_onset_min_gap_ms / cfg.hop_ms))

    segments: list[tuple[int, int, str]] = []
    for region_start, region_end in regions:
        boundaries: dict[int, str] = {region_start: "VOICE_START", region_end: "VOICE_END"}
        recovery_edges = np.flatnonzero(
            long_recovered[1:].astype(np.int8) != long_recovered[:-1].astype(np.int8)
        ) + 1
        for b in recovery_edges:
            if region_start + 2 <= b <= region_end - 2:
                boundaries[int(b)] = (
                    "CANDIDATE_RECOVERY_START" if long_recovered[b] else "CANDIDATE_RECOVERY_END"
                )
        for b in sorted(pitch_boundaries):
            if region_start + 2 <= b <= region_end - 2:
                boundaries[b] = "PITCH_CHANGE"

        accepted_onsets: list[int] = []
        for b in sorted(onset_boundaries):
            if not (region_start + 2 <= b <= region_end - 2):
                continue
            if accepted_onsets and b - accepted_onsets[-1] < min_same_pitch_gap:
                continue
            # 같은 음정에서도 새 음절이면 분리. 단, 지나치게 약한 후보는 제외.
            local = pitch[max(region_start, b - 5) : min(region_end, b + 6)]
            if np.sum(np.isfinite(local)) >= 3:
                boundaries.setdefault(b, "SYLLABLE_ONSET")
                accepted_onsets.append(b)

        # Quiet attacks are considered only inside a long interval that the
        # normal pitch/onset detectors would otherwise keep as one note.
        long_segment = max(1, round(cfg.soft_onset_long_segment_ms / cfg.hop_ms))
        edge_gap = max(1, round(cfg.soft_onset_edge_gap_ms / cfg.hop_ms))
        primary_boundaries = sorted(boundaries)
        for left, right in zip(primary_boundaries[:-1], primary_boundaries[1:]):
            if right - left < long_segment:
                continue
            previous = left
            for b in sorted(soft_onset_boundaries):
                if not (left + edge_gap <= b <= right - edge_gap):
                    continue
                if b - previous < min_same_pitch_gap:
                    continue
                local = pitch[max(region_start, b - 5) : min(region_end, b + 6)]
                if np.sum(np.isfinite(local)) >= 3:
                    boundaries.setdefault(b, "SOFT_SYLLABLE_ONSET")
                    previous = b

        ordered = sorted(boundaries)
        for a, b in zip(ordered[:-1], ordered[1:]):
            if b > a:
                segments.append((a, b, boundaries.get(a, "UNKNOWN")))
    return segments


def merge_short_segments(
    segments: list[tuple[int, int, str]],
    frames: pd.DataFrame,
    cfg: AnalysisConfig,
) -> list[tuple[int, int, str]]:
    if not segments:
        return []
    pitch = frames["smoothed_midi"].to_numpy(float)
    min_frames = max(1, round(cfg.short_note_merge_ms / cfg.hop_ms))
    threshold = cfg.merge_pitch_cents / 100.0
    result = segments.copy()

    changed = True
    while changed and len(result) > 1:
        changed = False
        for i, (start, end, reason) in enumerate(result):
            if end - start >= min_frames:
                continue
            center = representative_pitch(pitch[start:end])
            candidates: list[tuple[float, int]] = []
            if i > 0 and result[i - 1][1] == start:
                ps, pe, _ = result[i - 1]
                pc = representative_pitch(pitch[ps:pe])
                candidates.append((abs(center - pc) if np.isfinite(center + pc) else 99, i - 1))
            if i + 1 < len(result) and end == result[i + 1][0]:
                ns, ne, _ = result[i + 1]
                nc = representative_pitch(pitch[ns:ne])
                candidates.append((abs(center - nc) if np.isfinite(center + nc) else 99, i + 1))
            if not candidates:
                continue
            diff, target = min(candidates)
            if diff > threshold and (end - start) >= round(cfg.min_note_ms / cfg.hop_ms):
                continue
            if target < i:
                ps, _, pr = result[target]
                result[target] = (ps, end, pr)
                result.pop(i)
            else:
                _, ne, nr = result[target]
                result[i] = (start, ne, reason if reason != "UNKNOWN" else nr)
                result.pop(target)
            changed = True
            break
    return result


def build_notes(frames: pd.DataFrame, cfg: AnalysisConfig) -> list[dict[str, Any]]:
    pitch = frames["smoothed_midi"].to_numpy(float)
    confidence = frames["confidence"].to_numpy(float)
    rms_db = frames["rms_db"].to_numpy(float)
    segments = merge_short_segments(make_raw_segments(frames, cfg), frames, cfg)
    min_frames = max(1, round(cfg.min_note_ms / cfg.hop_ms))

    notes: list[dict[str, Any]] = []
    for start, end, boundary_type in segments:
        valid = pitch[start:end]
        valid = valid[np.isfinite(valid)]
        if end - start < min_frames or valid.size < max(3, min_frames // 2):
            continue
        center = representative_pitch(pitch[start:end])
        mean_rms = float(np.nanmean(rms_db[start:end]))
        if not np.isfinite(center) or mean_rms < cfg.min_note_rms_db:
            continue
        notes.append(
            {
                "note_id": len(notes) + 1,
                "start_ms": int(start * cfg.hop_ms),
                "end_ms": int(end * cfg.hop_ms),
                "duration_ms": int((end - start) * cfg.hop_ms),
                "pitch_midi": round(center, 4),
                "target_midi": int(round(center)),
                "target_note": librosa.midi_to_note(int(round(center)), octave=True),
                "boundary_type": boundary_type,
                "confidence": round(float(np.nanmean(confidence[start:end])), 4),
            }
        )
    return notes


def compact_pitch_frames(frames: pd.DataFrame) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for row in frames.itertuples(index=False):
        if not bool(row.voiced) or not np.isfinite(row.smoothed_midi):
            continue
        result.append(
            {
                "t": int(row.time_ms),
                "m": round(float(row.smoothed_midi), 4),
                "c": round(float(row.confidence), 3),
            }
        )
    return result


def build_reference(audio_path: Path, output_dir: Path, cfg: AnalysisConfig) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    frames, _ = analyze_frames(audio_path, cfg)
    notes = build_notes(frames, cfg)

    reference = {
        "version": "vocal-melody-analysis-v1",
        "source_file": audio_path.name,
        "duration_ms": int(frames["time_ms"].iloc[-1] + cfg.hop_ms) if len(frames) else 0,
        "sample_rate": cfg.sample_rate,
        "hop_ms": cfg.hop_ms,
        "notes": notes,
        "pitch_frames": compact_pitch_frames(frames),
        "config": asdict(cfg),
    }
    reference_path = output_dir / "reference.json"
    reference_path.write_text(json.dumps(reference, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "notes.json").write_text(json.dumps(notes, ensure_ascii=False, indent=2), encoding="utf-8")
    frames.to_csv(output_dir / "frames.csv", index=False, float_format="%.6f")
    save_plot(frames, notes, output_dir / "melody_line.png")
    return reference_path


def save_plot(frames: pd.DataFrame, notes: list[dict[str, Any]], output_path: Path) -> None:
    if frames.empty:
        return
    fig, ax = plt.subplots(figsize=(18, 7))
    ax.plot(frames["time_ms"] / 1000.0, frames["midi_pitch"], linewidth=0.55, alpha=0.65, label="F0")
    for note in notes:
        ax.hlines(note["pitch_midi"], note["start_ms"] / 1000, note["end_ms"] / 1000, linewidth=2.5)
        ax.axvline(note["start_ms"] / 1000, linewidth=0.35, alpha=0.25)
    ax.set_title("Lead-vocal melody line")
    ax.set_xlabel("Time (seconds)")
    ax.set_ylabel("MIDI pitch")
    ax.grid(True, alpha=0.2)
    ax.legend(loc="upper right")
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)



def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="메인 보컬에서 멜로디/F0 산출물을 생성합니다."
    )
    parser.add_argument("audio", type=Path, help="분석할 메인 보컬 오디오")
    parser.add_argument("--output", type=Path, default=Path("reference_output"))
    parser.add_argument("--hop-ms", type=int, choices=(5, 10, 20), default=10)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = AnalysisConfig(hop_ms=args.hop_ms)
    path = build_reference(args.audio, args.output, cfg)
    print(f"산출물 생성 완료: {path.resolve()}")


if __name__ == "__main__":
    main()
