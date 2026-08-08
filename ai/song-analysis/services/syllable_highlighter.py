from __future__ import annotations

import gc
import json
import math
import os
import re
from argparse import Namespace
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from .stt_vocal.text import LyricLine, parse_reference_lyrics


HIGHLIGHT_METHOD = "uploaded-lrc-anchor+ctc+heldnote"
_LRC_TIMESTAMP_RE = re.compile(
    r"\[(?P<minute>\d{1,3}):(?P<second>[0-5]?\d)(?:[\.:](?P<fraction>\d{1,3}))?\]"
)
_ENHANCED_LRC_TIMESTAMP_RE = re.compile(r"<\d{1,3}:[0-5]?\d(?:[\.:]\d{1,3})?>")
_LRC_OFFSET_RE = re.compile(r"\[offset\s*:\s*([+-]?\d+)\s*\]", re.IGNORECASE)
_LRC_METADATA_RE = re.compile(r"^\[[A-Za-z][A-Za-z0-9_-]*\s*:[^\]]*\]\s*$")
_TEXT_KEYS = ("text", "lyric", "lyrics", "content", "line")
_START_KEYS = ("start_ms", "time_ms", "timestamp_ms", "start", "time", "timestamp")
_END_KEYS = ("end_ms", "end")


class SyllableHighlightError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class HighlightConfig:
    device: str = "cuda"
    whisper_model: str = "large-v3"
    language: str = "ko"
    model_dir: Path | None = None
    strict: bool = True

    @classmethod
    def from_environment(cls, *, model_dir: Path | None = None) -> "HighlightConfig":
        strict = os.getenv("SYLLABLE_ALIGNMENT_STRICT", "1").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        return cls(
            device=os.getenv("SYLLABLE_ALIGNMENT_DEVICE", "cuda").strip() or "cuda",
            whisper_model=(
                os.getenv("SYLLABLE_WHISPER_MODEL", "large-v3").strip() or "large-v3"
            ),
            language=os.getenv("SYLLABLE_ALIGNMENT_LANGUAGE", "ko").strip() or "ko",
            model_dir=model_dir,
            strict=strict,
        )


@dataclass(frozen=True, slots=True)
class LyricAnchor:
    line: LyricLine
    start: float
    next_start: float | None
    explicit_end: float | None = None


@dataclass(frozen=True, slots=True)
class ParsedLyrics:
    text: str
    lines: tuple[LyricLine, ...]
    anchors: tuple[LyricAnchor, ...] = ()

    @property
    def has_complete_anchors(self) -> bool:
        return bool(self.lines) and len(self.anchors) == len(self.lines)


@dataclass(frozen=True, slots=True)
class _RawTimedLine:
    source_line: int
    sequence: int
    text: str
    start: float
    explicit_end: float | None = None


def empty_syllable_highlights() -> dict[str, Any]:
    return {
        "time_unit": "ms",
        "method": HIGHLIGHT_METHOD,
        "syllables": [],
    }


def _fraction_seconds(value: str | None) -> float:
    if not value:
        return 0.0
    return int(value) / (10 ** len(value))


def _timestamp_seconds(match: re.Match[str]) -> float:
    return (
        int(match.group("minute")) * 60
        + int(match.group("second"))
        + _fraction_seconds(match.group("fraction"))
    )


def _make_parsed_timed_lines(
    raw_lines: Sequence[_RawTimedLine],
    *,
    boundary_times: Sequence[float] = (),
) -> ParsedLyrics:
    ordered = sorted(raw_lines, key=lambda item: (item.start, item.sequence))
    all_boundaries = sorted(
        {
            max(0.0, float(value))
            for value in (
                *boundary_times,
                *(item.start for item in ordered),
            )
            if math.isfinite(float(value))
        }
    )
    retained = [item for item in ordered if item.text.strip()]
    lines: list[LyricLine] = []
    anchors: list[LyricAnchor] = []
    for item in retained:
        text = item.text.strip()
        line = LyricLine(
            index=len(lines),
            source_line=item.source_line,
            text=text,
            normalized="",
        )
        # Reuse the canonical parser to keep normalization semantics identical
        # to the imported stt_vocal package.
        normalized_line = parse_reference_lyrics(text)
        if not normalized_line:
            continue
        line = LyricLine(
            index=len(lines),
            source_line=item.source_line,
            text=text,
            normalized=normalized_line[0].normalized,
        )
        next_start = next(
            (value for value in all_boundaries if value > item.start + 1e-9),
            None,
        )
        lines.append(line)
        anchors.append(
            LyricAnchor(
                line=line,
                start=max(0.0, item.start),
                next_start=next_start,
                explicit_end=item.explicit_end,
            )
        )
    return ParsedLyrics(
        text="\n".join(line.text for line in lines),
        lines=tuple(lines),
        anchors=tuple(anchors),
    )


def parse_lrc_text(text: str) -> ParsedLyrics:
    if not isinstance(text, str):
        raise TypeError("LRC lyrics must be text")

    offset_match = _LRC_OFFSET_RE.search(text)
    offset_seconds = int(offset_match.group(1)) / 1000.0 if offset_match else 0.0
    timed: list[_RawTimedLine] = []
    boundaries: list[float] = []
    plain_lines: list[str] = []
    has_untimed_lyrics = False
    sequence = 0

    for source_line, raw_line in enumerate(text.splitlines()):
        raw_line = raw_line.removeprefix("\ufeff")
        matches = list(_LRC_TIMESTAMP_RE.finditer(raw_line))
        display = _ENHANCED_LRC_TIMESTAMP_RE.sub(
            "",
            _LRC_TIMESTAMP_RE.sub("", raw_line),
        ).strip()
        is_metadata = bool(
            _LRC_OFFSET_RE.fullmatch(raw_line.strip())
            or _LRC_METADATA_RE.fullmatch(raw_line.strip())
        )
        if display and not is_metadata:
            # Keep one display copy per physical line. Multiple timestamps may
            # intentionally repeat a line on the timed path, but the plain
            # fallback must not duplicate it.
            plain_lines.append(display)

        if matches:
            for match in matches:
                start = max(0.0, _timestamp_seconds(match) + offset_seconds)
                boundaries.append(start)
                timed.append(
                    _RawTimedLine(
                        source_line=source_line,
                        sequence=sequence,
                        text=display,
                        start=start,
                    )
                )
                sequence += 1
            continue

        if is_metadata:
            continue
        if display:
            has_untimed_lyrics = True

    parsed = _make_parsed_timed_lines(timed, boundary_times=boundaries)
    if parsed.lines and not has_untimed_lyrics:
        return parsed

    # A partially timed LRC cannot safely mix line-indexed CTC results with
    # unanchored lines. Preserve every lyric line and let Whisper derive a
    # complete set of anchors instead of silently dropping untimed lyrics.
    plain_text = "\n".join(plain_lines)
    lines = tuple(parse_reference_lyrics(plain_text))
    return ParsedLyrics(text=plain_text, lines=lines)


def _first_string(mapping: Mapping[str, Any], keys: Sequence[str]) -> str | None:
    for key in keys:
        value = mapping.get(key)
        if isinstance(value, str):
            return value
    return None


def _time_from_mapping(
    mapping: Mapping[str, Any],
    keys: Sequence[str],
    *,
    default_unit: str,
) -> float | None:
    for key in keys:
        if key not in mapping or mapping[key] is None:
            continue
        value = mapping[key]
        if isinstance(value, str) and ":" in value:
            parts = value.split(":")
            try:
                seconds = 0.0
                for part in parts:
                    seconds = seconds * 60 + float(part)
                return seconds if math.isfinite(seconds) and seconds >= 0 else None
            except ValueError:
                continue
        if isinstance(value, bool):
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(number) or number < 0:
            continue
        if key.endswith("_ms") or default_unit == "ms":
            number /= 1000.0
        return number
    return None


def _json_line_records(payload: Any) -> tuple[list[Any], str]:
    if isinstance(payload, list):
        return payload, "seconds"
    if not isinstance(payload, Mapping):
        return [], "seconds"

    timeline = payload.get("timeline")
    unit = payload.get("time_unit")
    if isinstance(timeline, Mapping):
        unit = timeline.get("unit", unit)
    default_unit = (
        "ms"
        if str(unit).lower() in {"ms", "millisecond", "milliseconds"}
        else "seconds"
    )
    for key in ("lines", "lyrics", "data", "items"):
        value = payload.get(key)
        if isinstance(value, list):
            return value, default_unit
    return [], default_unit


def parse_json_lyrics(payload: Any) -> ParsedLyrics:
    if isinstance(payload, str):
        return (
            parse_lrc_text(payload)
            if _LRC_TIMESTAMP_RE.search(payload)
            else ParsedLyrics(
                text=payload,
                lines=tuple(parse_reference_lyrics(payload)),
            )
        )

    if isinstance(payload, Mapping):
        for key in ("lyrics", "text", "content"):
            value = payload.get(key)
            if isinstance(value, str):
                return (
                    parse_lrc_text(value)
                    if _LRC_TIMESTAMP_RE.search(value)
                    else ParsedLyrics(
                        text=value,
                        lines=tuple(parse_reference_lyrics(value)),
                    )
                )

    records, default_unit = _json_line_records(payload)
    if not records:
        raise SyllableHighlightError("JSON lyrics contain no supported lyric lines")

    raw_timed: list[_RawTimedLine] = []
    plain_lines: list[str] = []
    all_have_start = True
    for source_line, record in enumerate(records):
        if isinstance(record, str):
            text = record.strip()
            start = None
            end = None
        elif isinstance(record, Mapping):
            text = (_first_string(record, _TEXT_KEYS) or "").strip()
            start = _time_from_mapping(record, _START_KEYS, default_unit=default_unit)
            end = _time_from_mapping(record, _END_KEYS, default_unit=default_unit)
        else:
            continue
        if not text:
            continue
        plain_lines.append(text)
        if start is None:
            all_have_start = False
            continue
        raw_timed.append(
            _RawTimedLine(
                source_line=source_line,
                sequence=source_line,
                text=text,
                start=start,
                explicit_end=end,
            )
        )

    if not plain_lines:
        raise SyllableHighlightError("JSON lyrics contain no non-empty lyric text")
    if all_have_start and len(raw_timed) == len(plain_lines):
        return _make_parsed_timed_lines(raw_timed)

    plain_text = "\n".join(plain_lines)
    return ParsedLyrics(
        text=plain_text, lines=tuple(parse_reference_lyrics(plain_text))
    )


def parse_lyrics_file(path: Path) -> ParsedLyrics:
    suffix = path.suffix.lower()
    text = path.read_text(encoding="utf-8-sig")
    if suffix == ".lrc":
        parsed = parse_lrc_text(text)
    elif suffix == ".json":
        parsed = parse_json_lyrics(json.loads(text))
    elif _LRC_TIMESTAMP_RE.search(text):
        # Some upload clients keep the historical .txt filename even when the
        # contents are timestamped LRC. Prefer the content signal so those
        # anchors are not transcribed as literal brackets and digits.
        parsed = parse_lrc_text(text)
    else:
        parsed = ParsedLyrics(text=text, lines=tuple(parse_reference_lyrics(text)))
    if not parsed.lines:
        raise SyllableHighlightError("lyrics contain no highlightable lines")
    return parsed


def _run_original_stt_vocal_pipeline(
    parsed: ParsedLyrics,
    *,
    audio_path: Path,
    vocals_path: Path,
    config: HighlightConfig,
) -> dict[str, Any]:
    """Run stt_vocal unchanged while supplying the already separated vocal stem."""
    from .stt_vocal.cli import _run_align

    prepared_lyrics_path = vocals_path.with_name("syllable_alignment_lyrics.txt")
    alignment_output_path = vocals_path.with_name("syllable_alignment.json")
    prepared_lyrics_path.write_text(parsed.text, encoding="utf-8")

    args = Namespace(
        audio=audio_path,
        lyrics=prepared_lyrics_path,
        output=alignment_output_path,
        vocals=vocals_path,
        alignment_json=None,
        skip_separation=False,
        language=config.language,
        model=config.whisper_model,
        whisperx=True,
        no_activity_filter=False,
        device=config.device,
        preview=None,
        compact=False,
        model_dir=config.model_dir,
    )
    _run_align(args)
    document = json.loads(alignment_output_path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise SyllableHighlightError("stt_vocal alignment output must be an object")
    return document


def flatten_alignment_document(document: Mapping[str, Any]) -> dict[str, Any]:
    output = empty_syllable_highlights()
    raw_lines = document.get("lines", [])
    if not isinstance(raw_lines, Sequence) or isinstance(raw_lines, (str, bytes)):
        raise SyllableHighlightError("alignment document lines must be a list")

    syllables: list[dict[str, Any]] = []
    for fallback_line, line in enumerate(raw_lines):
        if not isinstance(line, Mapping):
            continue
        raw_line = line.get("index", fallback_line)
        try:
            line_index = int(raw_line)
        except (TypeError, ValueError):
            line_index = fallback_line
        units = line.get("syllables", line.get("units", []))
        if not isinstance(units, Sequence) or isinstance(units, (str, bytes)):
            continue
        for unit in units:
            if not isinstance(unit, Mapping):
                continue
            if unit.get("start") is None or unit.get("end") is None:
                continue
            try:
                start = float(unit["start"])
                end = float(unit["end"])
            except (TypeError, ValueError):
                continue
            if not math.isfinite(start) or not math.isfinite(end) or end < start:
                continue
            text = unit.get("text", unit.get("syllable"))
            if not isinstance(text, str) or not text:
                continue
            start_ms = max(0, round(start * 1000))
            end_ms = max(start_ms, round(end * 1000))
            raw_score = unit.get("confidence", unit.get("score"))
            try:
                numeric_score = float(raw_score) if raw_score is not None else None
            except (TypeError, ValueError):
                numeric_score = None
            score = (
                round(numeric_score, 3)
                if numeric_score is not None and math.isfinite(numeric_score)
                else None
            )
            syllables.append(
                {
                    "syllable": text,
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                    "duration_ms": end_ms - start_ms,
                    "line": line_index,
                    "score": score,
                }
            )
    output["syllables"] = syllables
    return output


def _write_reference(path: Path, reference: Mapping[str, Any]) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(reference, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(path)


def _release_model_memory() -> None:
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def add_syllable_highlights(
    reference_path: Path,
    audio_path: Path,
    vocals_path: Path,
    lyrics_path: Path,
    *,
    config: HighlightConfig | None = None,
    logger: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    config = config or HighlightConfig.from_environment()
    reference = json.loads(reference_path.read_text(encoding="utf-8"))
    if not isinstance(reference, dict):
        raise SyllableHighlightError("midi reference JSON must be an object")

    highlights = empty_syllable_highlights()

    try:
        if config.model_dir is not None:
            config.model_dir.mkdir(parents=True, exist_ok=True)
            os.environ.setdefault(
                "HF_HOME",
                str(config.model_dir.parent / "huggingface"),
            )
        parsed = parse_lyrics_file(lyrics_path)

        if logger:
            logger(
                f"Syllable CTC alignment started: lines={len(parsed.lines)}, "
                "anchor=Whisper, separation=provided_vocals, "
                f"model={config.whisper_model}, device={config.device}"
            )

        document = _run_original_stt_vocal_pipeline(
            parsed,
            audio_path=audio_path,
            vocals_path=vocals_path,
            config=config,
        )
        highlights = flatten_alignment_document(document)
        if not highlights["syllables"]:
            raise SyllableHighlightError("CTC alignment returned no timed syllables")
        reference["syllable_highlights"] = highlights
        _write_reference(reference_path, reference)
        if logger:
            logger(
                "Syllable CTC alignment completed: "
                f"syllables={len(highlights['syllables'])}"
            )
        return highlights
    except Exception as exc:
        if logger:
            fallback = "" if config.strict else "; using an empty highlight list"
            logger(
                f"Syllable CTC alignment failed{fallback}: {type(exc).__name__}: {exc}"
            )
        if config.strict:
            raise
        reference["syllable_highlights"] = highlights
        _write_reference(reference_path, reference)
        return highlights
    finally:
        _release_model_memory()


__all__ = [
    "HIGHLIGHT_METHOD",
    "HighlightConfig",
    "LyricAnchor",
    "ParsedLyrics",
    "SyllableHighlightError",
    "add_syllable_highlights",
    "empty_syllable_highlights",
    "flatten_alignment_document",
    "parse_json_lyrics",
    "parse_lrc_text",
    "parse_lyrics_file",
]
