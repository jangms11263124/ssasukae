"""Lightweight configuration and stable JSON-envelope models.

The alignment algorithm's interval types live in :mod:`stt_vocal.postprocess`.
This module deliberately keeps the command-line boundary free of model-runtime
dependencies such as Torch, Whisper, Demucs, and WhisperX.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Sequence


SCHEMA_VERSION = "1.0"


@dataclass(frozen=True, slots=True)
class AlignConfig:
    """Inputs and runtime choices for one alignment job."""

    audio: Path
    lyrics: Path
    output: Path
    vocals: Path | None = None
    alignment_json: Path | None = None
    skip_separation: bool = False
    language: str | None = "ko"
    model: str = "large-v3"
    use_whisperx: bool = True
    activity_filter: bool = True
    device: str = "cpu"
    model_dir: Path | None = None

    @property
    def needs_separation(self) -> bool:
        """Whether the live-model path should create a vocal stem."""

        return (
            self.alignment_json is None
            and self.vocals is None
            and not self.skip_separation
        )

    @property
    def transcription_audio(self) -> Path:
        """Input used when separation is skipped or a vocal stem is supplied."""

        return self.vocals or self.audio


@dataclass(frozen=True, slots=True)
class TimelineDescriptor:
    """Declare how every timestamp in an output document is interpreted."""

    origin: str = "original_audio"
    unit: str = "seconds"

    def to_dict(self) -> dict[str, str]:
        return {"origin": self.origin, "unit": self.unit}


@dataclass(slots=True)
class AlignmentDocument:
    """Stable JSON envelope around the core alignment result.

    ``lines`` contains the serialized ``LineInterval`` values produced by the
    core. Each line is normalized to expose its display units under the public
    key ``syllables``.
    """

    audio: str
    lyrics: str
    lines: list[dict[str, Any]]
    confidence: float | None = None
    text_similarity: float | None = None
    flags: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    timeline: TimelineDescriptor = field(default_factory=TimelineDescriptor)
    schema_version: str = SCHEMA_VERSION

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "schema_version": self.schema_version,
            "timeline": self.timeline.to_dict(),
            "audio": self.audio,
            "lyrics": self.lyrics,
            "lines": self.lines,
            "confidence": self.confidence,
            "text_similarity": self.text_similarity,
            "flags": list(self.flags),
            "metadata": dict(self.metadata),
        }
        return payload


def serialize_core_result(
    result: Any,
    *,
    audio: Path,
    lyrics: Path,
    metadata: Mapping[str, Any] | None = None,
) -> AlignmentDocument:
    """Convert ``postprocess.AlignmentResult`` into the public JSON schema.

    The helper accepts the result's documented ``to_dict`` output and performs
    only boundary-level renaming. Keeping this conversion here prevents CLI
    users from depending on private dataclass implementation details.
    """

    if not hasattr(result, "to_dict"):
        raise TypeError("alignment result must provide to_dict()")

    raw = result.to_dict()
    if not isinstance(raw, Mapping):
        raise TypeError("alignment result to_dict() must return a mapping")

    raw_lines = raw.get("lines", [])
    if not isinstance(raw_lines, Sequence) or isinstance(raw_lines, (str, bytes)):
        raise TypeError("alignment result 'lines' must be a sequence")

    lines = [_normalize_line(line) for line in raw_lines]
    result_metadata = raw.get("metadata", {})
    merged_metadata: dict[str, Any] = {}
    if isinstance(result_metadata, Mapping):
        merged_metadata.update(result_metadata)
    if metadata:
        merged_metadata.update(metadata)

    confidence = raw.get("confidence", getattr(result, "confidence", None))
    similarity = raw.get(
        "text_similarity", getattr(result, "text_similarity", None)
    )
    flags = raw.get("flags", getattr(result, "flags", []))
    if flags is None:
        flags = []

    return AlignmentDocument(
        audio=str(audio),
        lyrics=str(lyrics),
        lines=lines,
        confidence=float(confidence) if confidence is not None else None,
        text_similarity=float(similarity) if similarity is not None else None,
        flags=[str(flag) for flag in flags],
        metadata=merged_metadata,
    )


def _normalize_line(line: Any) -> dict[str, Any]:
    if hasattr(line, "to_dict"):
        line = line.to_dict()
    if not isinstance(line, Mapping):
        raise TypeError("each alignment line must be a mapping")

    normalized = dict(line)
    units = normalized.pop("units", normalized.get("syllables", []))
    if units is None:
        units = []
    if not isinstance(units, Sequence) or isinstance(units, (str, bytes)):
        raise TypeError("line units/syllables must be a sequence")

    normalized["syllables"] = [_normalize_unit(unit) for unit in units]
    return normalized


def _normalize_unit(unit: Any) -> dict[str, Any]:
    if hasattr(unit, "to_dict"):
        unit = unit.to_dict()
    if not isinstance(unit, Mapping):
        raise TypeError("each syllable must be a mapping")

    normalized = dict(unit)
    if "text" not in normalized:
        for alias in ("unit", "token", "syllable"):
            if alias in normalized:
                normalized["text"] = normalized.pop(alias)
                break
    return normalized


__all__ = [
    "SCHEMA_VERSION",
    "AlignConfig",
    "AlignmentDocument",
    "TimelineDescriptor",
    "serialize_core_result",
]
