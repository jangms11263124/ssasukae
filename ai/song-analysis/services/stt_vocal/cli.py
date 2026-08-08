"""Command-line entry point for lyric alignment."""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
import wave
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from . import __version__
from .models import AlignConfig, serialize_core_result
from .text import normalize_text


class CliError(RuntimeError):
    """An expected, user-actionable command-line failure."""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="stt-vocal",
        description=(
            "Align reference lyrics to audio and emit line/syllable timings on "
            "the original audio timeline."
        ),
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    subparsers = parser.add_subparsers(dest="command", required=True)

    align = subparsers.add_parser(
        "align",
        help="align a UTF-8 lyric file to an audio file",
    )
    align.add_argument("--audio", required=True, type=Path, help="original audio file")
    align.add_argument("--lyrics", required=True, type=Path, help="UTF-8 reference lyrics")
    align.add_argument("--output", required=True, type=Path, help="output JSON path")
    align.add_argument(
        "--vocals",
        type=Path,
        help=(
            "duration-preserving vocal stem; supplying it skips source separation"
        ),
    )
    align.add_argument(
        "--alignment-json",
        type=Path,
        help=(
            "precomputed original-timeline spans; bypasses all heavy model runtimes"
        ),
    )
    align.add_argument(
        "--skip-separation",
        action="store_true",
        help="transcribe --audio directly when --vocals is not supplied",
    )
    align.add_argument(
        "--language",
        default="ko",
        help="spoken-language code passed to Whisper (default: ko; use auto for detection)",
    )
    align.add_argument(
        "--model",
        default="large-v3",
        help="Whisper checkpoint for the live-model path (default: large-v3)",
    )
    alignment_mode = align.add_mutually_exclusive_group()
    alignment_mode.add_argument(
        "--whisperx",
        dest="whisperx",
        action="store_true",
        default=True,
        help="force-align the reference lyrics with WhisperX (default)",
    )
    alignment_mode.add_argument(
        "--coarse-only",
        dest="whisperx",
        action="store_false",
        help="use Whisper word times only; useful for diagnostics, not precise karaoke",
    )
    align.add_argument(
        "--no-activity-filter",
        action="store_true",
        help="send the full vocal track to Whisper instead of detected active intervals",
    )
    align.add_argument(
        "--device",
        default="cpu",
        help="model device such as cpu or cuda (default: cpu)",
    )
    align.add_argument(
        "--compact",
        action="store_true",
        help="write compact JSON instead of indented human-readable JSON",
    )
    align.add_argument(
        "--preview",
        type=Path,
        help="also write a standalone browser karaoke preview",
    )

    render = subparsers.add_parser(
        "render", help="render an existing timing JSON as a browser preview"
    )
    render.add_argument("--timings", required=True, type=Path, help="timing JSON")
    render.add_argument("--output", required=True, type=Path, help="output HTML")
    render.add_argument(
        "--audio-source",
        help="audio URL/path embedded in the preview; omit to show a file picker",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.command == "align":
            _run_align(args)
        elif args.command == "render":
            from .render import render_file

            _require_file(args.timings, "timings")
            _validate_distinct_write_paths(
                {"render output": args.output},
                {"timings": args.timings},
            )
            render_file(args.timings, args.output, audio_source=args.audio_source)
        else:  # Defensive: argparse enforces the known subcommands.
            parser.error(f"unknown command: {args.command}")
    except (CliError, OSError, UnicodeError, json.JSONDecodeError, ValueError, TypeError) as exc:
        print(f"stt-vocal: error: {exc}", file=sys.stderr)
        return 2
    except ImportError as exc:
        print(
            "stt-vocal: optional model dependency is unavailable: "
            f"{exc}. Install with `pip install -e \".[full]\"`.",
            file=sys.stderr,
        )
        return 3
    except RuntimeError as exc:
        print(f"stt-vocal: model pipeline failed: {exc}", file=sys.stderr)
        return 4

    return 0


def _run_align(args: argparse.Namespace) -> None:
    language = None if str(args.language).lower() == "auto" else args.language
    config = AlignConfig(
        audio=args.audio,
        lyrics=args.lyrics,
        output=args.output,
        vocals=args.vocals,
        alignment_json=args.alignment_json,
        skip_separation=args.skip_separation,
        language=language,
        model=args.model,
        use_whisperx=args.whisperx,
        activity_filter=not args.no_activity_filter,
        device=args.device,
        model_dir=getattr(args, "model_dir", None),
    )
    _validate_config(config, preview=args.preview)

    lyrics_text = config.lyrics.read_text(encoding="utf-8-sig")
    if not lyrics_text.strip():
        raise CliError(f"lyrics file is empty: {config.lyrics}")

    if config.alignment_json is not None:
        payload = _load_json(config.alignment_json)
        _assert_original_timeline(payload, config.alignment_json)
        raw_spans = _extract_spans(payload)
        hold_audio = config.vocals or (config.audio if config.skip_separation else None)
        if hold_audio is not None:
            if config.vocals is not None:
                _validate_matching_audio_durations(
                    config.audio,
                    config.vocals,
                    label="--vocals",
                )
            energy_profile, hold_energy_metadata = _analyze_hold_energy(hold_audio)
        else:
            energy_profile = None
            hold_energy_metadata = {
                "enabled": False,
                "fallback_reason": (
                    "supply --vocals (or explicitly use --skip-separation) "
                    "to analyze held-note energy"
                ),
            }
        runtime_metadata = {
            "alignment_source": "json",
            "alignment_json": str(config.alignment_json),
            "separation": "bypassed",
            "activity": {
                "enabled": False,
                "hold_energy": hold_energy_metadata,
            },
        }
    else:
        raw_spans, runtime_metadata, energy_profile = _run_live_models(
            config, lyrics_text
        )

    if not raw_spans:
        raise CliError("alignment source did not contain any timed spans")

    audio_duration = _audio_duration(config.audio)
    if audio_duration is not None:
        latest_timestamp = max(float(span["end"]) for span in raw_spans)
        if latest_timestamp > audio_duration + 0.25:
            raise CliError(
                "alignment timestamp exceeds the original audio duration: "
                f"{latest_timestamp:.3f}s > {audio_duration:.3f}s"
            )

    # Imported only after input validation. The core itself has no heavy model deps.
    from .onset import rescue_document_onsets
    from .postprocess import build_alignment, extend_document_holds

    result = build_alignment(lyrics_text, raw_spans)
    document = serialize_core_result(
        result,
        audio=config.audio,
        lyrics=config.lyrics,
        metadata=runtime_metadata,
    )
    document_payload = rescue_document_onsets(
        document.to_dict(),
        energy_profile=energy_profile,
    )
    document_payload = extend_document_holds(
        document_payload,
        energy_profile=energy_profile,
        max_time=audio_duration,
    )
    _write_json(config.output, document_payload, compact=args.compact)
    if args.preview is not None:
        from .render import render_karaoke_html

        args.preview.parent.mkdir(parents=True, exist_ok=True)
        relative_audio = os.path.relpath(config.audio, args.preview.parent).replace("\\", "/")
        args.preview.write_text(
            render_karaoke_html(document_payload, audio_source=relative_audio),
            encoding="utf-8",
        )


def _run_live_models(
    config: AlignConfig, lyrics_text: str
) -> tuple[list[dict[str, Any]], dict[str, Any], Any | None]:
    # Keep Torch/Whisper/Demucs/WhisperX out of import-time and JSON-only execution.
    from .adapters import DemucsSeparator, WhisperTranscriber

    with tempfile.TemporaryDirectory(prefix="stt-vocal-") as temporary_directory:
        if config.needs_separation:
            separator = DemucsSeparator(device=config.device)
            transcription_audio = Path(
                separator.separate(config.audio, Path(temporary_directory))
            )
            separation = "demucs"
        else:
            transcription_audio = config.transcription_audio
            separation = "provided_vocals" if config.vocals is not None else "skipped"

        if separation in {"demucs", "provided_vocals"}:
            _validate_matching_audio_durations(
                config.audio,
                transcription_audio,
                label="Demucs vocal stem" if separation == "demucs" else "--vocals",
            )

        clip_timestamps = None
        energy_profile, hold_energy_metadata = _analyze_hold_energy(
            transcription_audio
        )
        activity_metadata: dict[str, Any] = {
            "enabled": config.activity_filter,
            "hold_energy": hold_energy_metadata,
        }
        duration = _audio_duration(transcription_audio)
        if config.activity_filter:
            try:
                from .activity import detect_vocal_activity

                activity = detect_vocal_activity(transcription_audio)
                duration = activity.duration
                if not activity.intervals:
                    raise CliError(
                        "no vocal activity was detected in the vocal stem; "
                        "check the stem or retry with --no-activity-filter"
                    )
                clip_timestamps = activity.intervals
                activity_metadata.update(
                    threshold_dbfs=activity.threshold_dbfs,
                    intervals=[list(pair) for pair in activity.intervals],
                )
            except (EOFError, wave.Error, ValueError) as exc:
                # Non-PCM inputs still work; they simply lose the deterministic
                # stdlib energy gate and Whisper sees the full track.
                activity_metadata.update(enabled=False, fallback_reason=str(exc))

        transcriber_options: dict[str, Any] = {
            "model_name": config.model,
            "device": config.device,
        }
        if config.model_dir is not None:
            transcriber_options["download_root"] = config.model_dir
        transcriber = WhisperTranscriber(**transcriber_options)
        coarse_segments = transcriber.transcribe(
            transcription_audio,
            clip_timestamps=clip_timestamps,
            language=config.language,
        )
        if not coarse_segments:
            raise CliError("Whisper returned no lyric anchors")

        from .anchors import filter_implausible_anchor_segments

        coarse_segments, rejected_anchors = filter_implausible_anchor_segments(
            coarse_segments
        )
        if not coarse_segments:
            raise CliError(
                "all Whisper lyric anchors were mechanically implausible; "
                "inspect the vocal stem or retry with --no-activity-filter"
            )
        if duration is None:
            duration_reader = getattr(transcriber, "audio_duration", None)
            if callable(duration_reader):
                try:
                    duration = float(duration_reader(transcription_audio))
                except RuntimeError:
                    # Transcription already decoded the file successfully. If
                    # a second duration-only decode fails, segment times still
                    # provide a conservative final fallback.
                    duration = None
        if duration is None:
            duration = max(segment.end for segment in coarse_segments)

        if config.use_whisperx:
            from .adapters import WhisperXAlignmentBackend
            from .anchors import anchor_quality, derive_line_windows
            from .recovery import (
                RecoveryCandidate,
                plan_recovery_clips,
                select_recovery_segments,
            )
            from .text import parse_reference_lyrics

            segment_dicts = [_anchor_segment_dict(segment) for segment in coarse_segments]
            windows = derive_line_windows(
                lyrics_text,
                segment_dicts,
                max(float(duration), 0.001),
            )
            if not windows:
                raise CliError("reference lyrics contain no alignable lines")

            recovery_clips = plan_recovery_clips(
                windows,
                max(float(duration), 0.001),
            )
            recovery_candidates: list[RecoveryCandidate] = []
            recovery_rejections: list[dict[str, Any]] = []
            for clip_index, clip in enumerate(recovery_clips):
                retry_segments = transcriber.transcribe(
                    transcription_audio,
                    clip_timestamps=[clip],
                    language=config.language,
                )
                retry_segments, retry_rejected = filter_implausible_anchor_segments(
                    retry_segments
                )
                recovery_candidates.extend(
                    RecoveryCandidate(segment=segment, clip=clip)
                    for segment in retry_segments
                )
                recovery_rejections.extend(
                    {
                        **rejection,
                        "recovery_clip": clip_index,
                    }
                    for rejection in retry_rejected
                )

            recovered_segments = select_recovery_segments(
                parse_reference_lyrics(lyrics_text),
                coarse_segments,
                recovery_candidates,
            )
            if recovered_segments:
                coarse_segments = sorted(
                    [*coarse_segments, *recovered_segments],
                    key=lambda segment: (segment.start, segment.end),
                )
                segment_dicts = [
                    _anchor_segment_dict(segment) for segment in coarse_segments
                ]
                windows = derive_line_windows(
                    lyrics_text,
                    segment_dicts,
                    max(float(duration), 0.001),
                )

            aligner = WhisperXAlignmentBackend(device=config.device)
            aligned = aligner.align(
                transcription_audio,
                transcript=[window.as_segment() for window in windows],
                # The project is Korean-first. Whisper language auto-detection
                # is useful for anchors, but WhisperX still needs one aligner.
                language=config.language or "ko",
            )
            spans = _extract_spans(aligned)
            alignment_source = "reference_lyrics+whisper_anchor+whisperx_ctc"
            anchor_metadata: dict[str, Any] = {
                "quality": round(anchor_quality(windows), 4),
                "rejected_segments": [*rejected_anchors, *recovery_rejections],
                "recovery": {
                    "attempted": bool(recovery_clips),
                    "clips": [
                        [round(clip.start, 3), round(clip.end, 3)]
                        for clip in recovery_clips
                    ],
                    "recovered_segments": len(recovered_segments),
                },
                "windows": [
                    {
                        "line": window.line_index,
                        "start": window.start,
                        "end": window.end,
                        "confidence": window.confidence,
                        "source": window.source,
                    }
                    for window in windows
                ],
            }
        else:
            spans = _extract_spans(WhisperTranscriber.word_spans(coarse_segments))
            # Whisper's segment index is not a reference-lyric line index.
            # Coarse mode therefore uses one global monotonic text match.
            for span in spans:
                span.pop("line_index", None)
            alignment_source = "whisper_word_timestamps_coarse_only"
            anchor_metadata = {"rejected_segments": rejected_anchors}

    metadata: dict[str, Any] = {
        "alignment_source": alignment_source,
        "separation": separation,
        "model": config.model,
        "language": config.language or "auto",
        "device": config.device,
        "audio_duration": round(float(duration), 3),
        "activity": activity_metadata,
        "anchors": anchor_metadata,
    }
    if config.vocals is not None:
        metadata["vocals"] = str(config.vocals)
    return spans, metadata, energy_profile


def _anchor_segment_dict(segment: Any) -> dict[str, Any]:
    """Preserve Whisper word boundaries for direct lyric anchors."""

    return {
        "text": segment.text,
        "start": segment.start,
        "end": segment.end,
        "words": [
            {
                "text": word.text,
                "start": word.start,
                "end": word.end,
            }
            for word in getattr(segment, "words", ())
        ],
    }


def _analyze_hold_energy(path: Path) -> tuple[Any | None, dict[str, Any]]:
    """Analyze a vocal stem without making PCM support a hard requirement."""

    try:
        from .activity import analyze_pcm16_energy

        profile = analyze_pcm16_energy(path)
    except (ImportError, EOFError, OSError, wave.Error, ValueError) as exc:
        return None, {"enabled": False, "fallback_reason": str(exc)}

    return profile, {
        "enabled": True,
        "method": "adaptive_rms_release",
        "frame_ms": round(float(profile.frame_seconds) * 1000),
        "hop_ms": round(float(profile.hop_seconds) * 1000),
        "global_threshold_dbfs": round(float(profile.threshold_dbfs), 2),
    }


def _wave_duration(path: Path) -> float | None:
    try:
        with wave.open(str(path), "rb") as stream:
            rate = stream.getframerate()
            return stream.getnframes() / rate if rate else None
    except (OSError, EOFError, wave.Error):
        return None


def _audio_duration(path: Path) -> float | None:
    """Read duration from PCM WAV or FFprobe without changing the timeline."""

    wav_duration = _wave_duration(path)
    if wav_duration is not None:
        return wav_duration
    try:
        completed = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0:
        return None
    try:
        duration = float(completed.stdout.strip())
    except (TypeError, ValueError):
        return None
    return duration if math.isfinite(duration) and duration > 0 else None


def _validate_matching_audio_durations(
    original: Path, vocals: Path, *, label: str
) -> None:
    original_duration = _audio_duration(original)
    vocal_duration = _audio_duration(vocals)
    if original_duration is None or vocal_duration is None:
        return
    difference = abs(original_duration - vocal_duration)
    if difference > 0.25:
        raise CliError(
            f"{label} must preserve the original timeline; durations differ by "
            f"{difference:.3f}s"
        )


def _validate_config(config: AlignConfig, *, preview: Path | None = None) -> None:
    _require_file(config.audio, "audio")
    _require_file(config.lyrics, "lyrics")
    if config.vocals is not None:
        _require_file(config.vocals, "vocals")
    if config.alignment_json is not None:
        _require_file(config.alignment_json, "alignment JSON")
    if config.output.exists() and config.output.is_dir():
        raise CliError(f"output is a directory: {config.output}")
    if preview is not None and preview.exists() and preview.is_dir():
        raise CliError(f"preview output is a directory: {preview}")

    write_paths = {"output": config.output}
    if preview is not None:
        write_paths["preview"] = preview
    read_paths = {"audio": config.audio, "lyrics": config.lyrics}
    if config.vocals is not None:
        read_paths["vocals"] = config.vocals
    if config.alignment_json is not None:
        read_paths["alignment JSON"] = config.alignment_json
    _validate_distinct_write_paths(write_paths, read_paths)


def _validate_distinct_write_paths(
    writes: Mapping[str, Path], reads: Mapping[str, Path]
) -> None:
    """Reject aliases that could overwrite an input or another output."""

    def key(path: Path) -> str:
        return os.path.normcase(str(path.expanduser().resolve(strict=False)))

    occupied: dict[str, str] = {key(path): label for label, path in reads.items()}
    for label, path in writes.items():
        normalized = key(path)
        if normalized in occupied:
            raise CliError(
                f"{label} path must differ from {occupied[normalized]} path: {path}"
            )
        occupied[normalized] = label


def _require_file(path: Path, label: str) -> None:
    if not path.exists():
        raise CliError(f"{label} file does not exist: {path}")
    if not path.is_file():
        raise CliError(f"{label} path is not a file: {path}")


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8-sig") as stream:
        return json.load(stream)


def _assert_original_timeline(payload: Any, source: Path) -> None:
    if not isinstance(payload, Mapping):
        return
    timeline = payload.get("timeline")
    if timeline is None:
        return

    if isinstance(timeline, str):
        origin = timeline
    elif isinstance(timeline, Mapping):
        origin = timeline.get("origin")
    else:
        raise CliError(f"invalid timeline declaration in {source}")

    if origin not in {None, "original", "original_audio"}:
        raise CliError(
            f"alignment JSON must use the original audio timeline, got {origin!r}"
        )


def _extract_spans(
    value: Any, *, inherited_line_index: int | None = None
) -> list[dict[str, Any]]:
    """Normalize adapter objects and common JSON layouts to flat timed spans."""

    def line_index_from(candidate: Any, fallback: int | None) -> int | None:
        raw_index: Any = None
        if isinstance(candidate, Mapping):
            raw_index = candidate.get("line_index")
            if raw_index is None and (
                "syllables" in candidate or "units" in candidate
            ):
                raw_index = candidate.get("index")
        elif _is_adapter_object(candidate):
            raw_index = getattr(candidate, "line_index", None)
        if raw_index is None:
            return fallback
        if isinstance(raw_index, bool):
            raise CliError("span line_index must be a non-negative integer")
        try:
            numeric = int(raw_index)
            exact = float(raw_index)
        except (TypeError, ValueError) as exc:
            raise CliError("span line_index must be a non-negative integer") from exc
        if numeric < 0 or exact != numeric:
            raise CliError("span line_index must be a non-negative integer")
        return numeric

    def timed_span(candidate: Any, line_index: int | None) -> dict[str, Any]:
        span = _coerce_span(candidate)
        if line_index is not None and "line_index" not in span:
            span["line_index"] = line_index
        return span

    def serialized_document_spans(
        lines: Sequence[Any],
    ) -> list[dict[str, Any]]:
        """Convert public line-local raw offsets to core global offsets."""

        spans: list[dict[str, Any]] = []
        global_cursor = 0
        for position, line in enumerate(lines):
            if not isinstance(line, Mapping):
                raise CliError(f"output line {position} must be an object")
            line_text = line.get("text")
            if not isinstance(line_text, str):
                raise CliError(f"output line {position} needs text")
            line_index = line_index_from(
                {"line_index": line.get("index")}, position
            )

            units = line.get("syllables")
            if units is None:
                units = line.get("units")
            if not isinstance(units, Sequence) or isinstance(units, (str, bytes)):
                raise CliError(
                    f"output line {position} syllables must be a list"
                )

            for unit_position, unit in enumerate(units):
                if not isinstance(unit, Mapping):
                    raise CliError(
                        f"output line {position} syllable {unit_position} "
                        "must be an object"
                    )
                start = unit.get("start")
                end = unit.get("end")
                if start is None and end is None:
                    # Partial output documents legitimately keep unmatched
                    # display units. They are not timed alignment spans.
                    continue
                if start is None or end is None:
                    raise CliError(
                        f"output line {position} syllable {unit_position} "
                        "must provide both start and end"
                    )

                span = timed_span(unit, line_index)
                if "char_start" in span and "char_end" in span:
                    raw_start = int(span["char_start"])
                    raw_end = int(span["char_end"])
                    if raw_end > len(line_text):
                        raise CliError(
                            f"output line {position} syllable {unit_position} "
                            "character offsets exceed line text"
                        )
                    expected = normalize_text(line_text[raw_start:raw_end])
                    actual = normalize_text(str(span["token"]))
                    if not expected or actual != expected:
                        raise CliError(
                            f"output line {position} syllable {unit_position} "
                            "text does not match its character offsets"
                        )
                    span["char_start"] = global_cursor + len(
                        normalize_text(line_text[:raw_start])
                    )
                    span["char_end"] = global_cursor + len(
                        normalize_text(line_text[:raw_end])
                    )
                spans.append(span)

            global_cursor += len(normalize_text(line_text))
        return spans

    if value is None:
        return []
    if isinstance(value, Mapping):
        current_line_index = line_index_from(value, inherited_line_index)
        lines = value.get("lines")
        if isinstance(lines, Sequence) and not isinstance(lines, (str, bytes)):
            has_public_units = any(
                isinstance(line, Mapping)
                and ("syllables" in line or "units" in line)
                for line in lines
            )
            public_document = has_public_units and (
                "schema_version" in value
                or all(key in value for key in ("timeline", "audio", "lyrics"))
            )
            if public_document:
                return serialized_document_spans(lines)
            spans: list[dict[str, Any]] = []
            for position, line in enumerate(lines):
                fallback = position
                if isinstance(line, Mapping) and "index" in line:
                    explicit = line_index_from(
                        {"line_index": line.get("index")}, position
                    )
                    fallback = position if explicit is None else explicit
                spans.extend(
                    _extract_spans(line, inherited_line_index=fallback)
                )
            return spans
        for container_key in ("spans", "segments", "words", "units", "syllables"):
            nested = value.get(container_key)
            if isinstance(nested, Sequence) and not isinstance(nested, (str, bytes)):
                return _extract_spans(
                    nested, inherited_line_index=current_line_index
                )
        return [timed_span(value, current_line_index)] if _looks_timed(value) else []

    if _is_adapter_object(value):
        current_line_index = line_index_from(value, inherited_line_index)
        for container_name in ("spans", "segments", "words", "units", "syllables"):
            nested = getattr(value, container_name, None)
            if nested is not None:
                extracted = _extract_spans(
                    nested, inherited_line_index=current_line_index
                )
                if extracted:
                    return extracted
        return [timed_span(value, current_line_index)] if _looks_timed(value) else []

    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        spans: list[dict[str, Any]] = []
        for item in value:
            if isinstance(item, Mapping) or _is_adapter_object(item):
                spans.extend(
                    _extract_spans(
                        item, inherited_line_index=inherited_line_index
                    )
                )
        return spans

    raise CliError("alignment data must be a JSON object or array")


def _is_adapter_object(value: Any) -> bool:
    return not isinstance(
        value,
        (str, bytes, int, float, bool, Path, Mapping, Sequence),
    ) and hasattr(value, "__class__")


def _looks_timed(value: Any) -> bool:
    if isinstance(value, Mapping):
        return "start" in value and "end" in value
    return hasattr(value, "start") and hasattr(value, "end")


def _coerce_span(value: Any) -> dict[str, Any]:
    def field(*names: str, default: Any = None) -> Any:
        for name in names:
            if isinstance(value, Mapping) and name in value:
                return value[name]
            if hasattr(value, name):
                return getattr(value, name)
        return default

    token = field("token", "text", "word", "unit", "syllable")
    if token is None:
        raise CliError("each timed span needs token, text, or word")
    start = _finite_time(field("start"), "start")
    end = _finite_time(field("end"), "end")
    if end < start:
        raise CliError(f"span ends before it starts: {start} > {end}")

    span: dict[str, Any] = {"token": str(token), "start": start, "end": end}
    score = field("score", "confidence", "probability")
    if score is not None:
        numeric_score = float(score)
        if not math.isfinite(numeric_score):
            raise CliError("span confidence must be finite")
        span["score"] = numeric_score

    line_index = field("line_index", "line")
    if line_index is not None:
        if isinstance(line_index, bool):
            raise CliError("span line_index must be a non-negative integer")
        try:
            numeric_line_index = int(line_index)
            exact_line_index = float(line_index)
        except (TypeError, ValueError) as exc:
            raise CliError("span line_index must be a non-negative integer") from exc
        if numeric_line_index < 0 or exact_line_index != numeric_line_index:
            raise CliError("span line_index must be a non-negative integer")
        span["line_index"] = numeric_line_index

    char_start = field("char_start", "character_start")
    char_end = field("char_end", "character_end")
    if (char_start is None) != (char_end is None):
        raise CliError("span character offsets require both char_start and char_end")
    if char_start is not None and char_end is not None:
        if isinstance(char_start, bool) or isinstance(char_end, bool):
            raise CliError("span character offsets must be integers")
        try:
            numeric_char_start = int(char_start)
            numeric_char_end = int(char_end)
            exact_char_start = float(char_start)
            exact_char_end = float(char_end)
        except (TypeError, ValueError) as exc:
            raise CliError("span character offsets must be integers") from exc
        if (
            exact_char_start != numeric_char_start
            or exact_char_end != numeric_char_end
            or numeric_char_start < 0
            or numeric_char_end <= numeric_char_start
        ):
            raise CliError(
                "span character offsets must satisfy 0 <= char_start < char_end"
            )
        span["char_start"] = numeric_char_start
        span["char_end"] = numeric_char_end
    return span


def _finite_time(value: Any, name: str) -> float:
    if value is None:
        raise CliError(f"span {name} is missing")
    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise CliError(f"span {name} must be a non-negative finite number")
    return number


def _write_json(path: Path, payload: Mapping[str, Any], *, compact: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    else:
        serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    path.write_text(serialized + "\n", encoding="utf-8")


if __name__ == "__main__":  # pragma: no cover - console-script path is tested.
    raise SystemExit(main())
