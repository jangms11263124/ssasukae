"""Turn token/phoneme alignments into a stable karaoke timeline."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass, replace
import math
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .activity import EnergyProfile

from .text import DisplayUnit, LyricLine, match_text, normalize_text, parse_reference_lyrics, split_display_units


@dataclass(frozen=True)
class AlignmentSpan:
    """One word, character, or phoneme timing emitted by an aligner.

    ``char_start``/``char_end``, when supplied, refer to half-open character
    offsets in the concatenated *normalized* reference lyric (line breaks and
    punctuation omitted). These offsets make phoneme-to-syllable mapping
    deterministic even when phoneme labels differ from written text.
    """

    token: str
    start: float
    end: float
    confidence: float | None = None
    char_start: int | None = None
    char_end: int | None = None
    line_index: int | None = None

    def __post_init__(self) -> None:
        if (self.char_start is None) != (self.char_end is None):
            raise ValueError("character offsets must be provided together")
        if self.char_start is not None and self.char_end is not None:
            if (
                isinstance(self.char_start, bool)
                or isinstance(self.char_end, bool)
                or not isinstance(self.char_start, int)
                or not isinstance(self.char_end, int)
            ):
                raise ValueError("character offsets must be integers")
            if self.char_start < 0 or self.char_end <= self.char_start:
                raise ValueError("character offsets must satisfy 0 <= start < end")
        if self.line_index is not None:
            if (
                isinstance(self.line_index, bool)
                or not isinstance(self.line_index, int)
                or self.line_index < 0
            ):
                raise ValueError("line_index must be a non-negative integer")


@dataclass(frozen=True)
class UnitInterval:
    unit: DisplayUnit
    start: float | None
    end: float | None
    confidence: float
    flags: tuple[str, ...] = ()
    source_span_indices: tuple[int, ...] = ()

    @property
    def duration(self) -> float | None:
        if self.start is None or self.end is None:
            return None
        return self.end - self.start

    def to_dict(self) -> dict[str, Any]:
        return {
            "index": self.unit.index,
            "text": self.unit.text,
            "kind": self.unit.kind,
            "char_start": self.unit.char_start,
            "char_end": self.unit.char_end,
            "start": self.start,
            "end": self.end,
            "confidence": self.confidence,
            "flags": list(self.flags),
        }


@dataclass(frozen=True)
class LineInterval:
    line: LyricLine
    start: float | None
    end: float | None
    units: tuple[UnitInterval, ...]
    confidence: float
    flags: tuple[str, ...] = ()

    @property
    def syllables(self) -> tuple[UnitInterval, ...]:
        """Alias used by karaoke-oriented callers and serializers."""

        return self.units

    def to_dict(self) -> dict[str, Any]:
        return {
            "index": self.line.index,
            "source_line": self.line.source_line,
            "text": self.line.text,
            "start": self.start,
            "end": self.end,
            "confidence": self.confidence,
            "flags": list(self.flags),
            "syllables": [unit.to_dict() for unit in self.units],
        }


@dataclass(frozen=True)
class AlignmentResult:
    lines: tuple[LineInterval, ...]
    units: tuple[UnitInterval, ...]
    confidence: float
    text_similarity: float
    flags: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "confidence": self.confidence,
            "text_similarity": self.text_similarity,
            "flags": list(self.flags),
            "lines": [line.to_dict() for line in self.lines],
        }


@dataclass(frozen=True, slots=True)
class HoldConfig:
    """Timing policy for turning short CTC spans into karaoke sweeps."""

    release_silence_ms: int = 150
    evidence_ms: int = 40
    evidence_probe_ms: int = 200
    maximum_extension_seconds: float | None = None
    fallback_maximum_extension_seconds: float = 3.0
    minimum_visual_seconds: float = 0.06

    def __post_init__(self) -> None:
        if self.release_silence_ms <= 0:
            raise ValueError("release_silence_ms must be positive")
        if self.evidence_ms <= 0 or self.evidence_probe_ms <= 0:
            raise ValueError("hold evidence durations must be positive")
        if self.evidence_ms > self.evidence_probe_ms:
            raise ValueError("evidence_ms cannot exceed evidence_probe_ms")
        if (
            self.maximum_extension_seconds is not None
            and self.maximum_extension_seconds <= 0
        ):
            raise ValueError("maximum_extension_seconds must be positive when set")
        if self.fallback_maximum_extension_seconds <= 0:
            raise ValueError("fallback_maximum_extension_seconds must be positive")
        if self.minimum_visual_seconds < 0:
            raise ValueError("minimum_visual_seconds cannot be negative")


def _unique_flags(*groups: Iterable[str]) -> tuple[str, ...]:
    output: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for flag in group:
            if flag not in seen:
                seen.add(flag)
                output.append(flag)
    return tuple(output)


def _read_field(value: object, names: Sequence[str]) -> object | None:
    if isinstance(value, Mapping):
        for name in names:
            if name in value:
                return value[name]
        return None
    for name in names:
        if hasattr(value, name):
            return getattr(value, name)
    return None


def _is_container(value: object, field: str) -> bool:
    nested = _read_field(value, (field,))
    return isinstance(nested, Iterable) and not isinstance(nested, (str, bytes, Mapping))


def coerce_alignment_spans(raw_alignment: object) -> list[AlignmentSpan]:
    """Coerce common Whisper/aligner output shapes into ``AlignmentSpan``.

    A sequence of mappings or objects is accepted. Container mappings with a
    ``words`` or ``segments`` sequence are flattened recursively. Field aliases
    include ``word``/``text``/``label`` and ``score``/``probability``.
    """

    if raw_alignment is None:
        return []
    if isinstance(raw_alignment, AlignmentSpan):
        return [raw_alignment]

    if _is_container(raw_alignment, "words"):
        return coerce_alignment_spans(_read_field(raw_alignment, ("words",)))
    if _is_container(raw_alignment, "segments"):
        flattened: list[AlignmentSpan] = []
        nested_segments = _read_field(raw_alignment, ("segments",))
        assert nested_segments is not None
        for segment in nested_segments:  # type: ignore[union-attr]
            flattened.extend(coerce_alignment_spans(segment))
        return flattened

    if isinstance(raw_alignment, Iterable) and not isinstance(raw_alignment, (str, bytes, Mapping)):
        flattened = []
        for item in raw_alignment:
            flattened.extend(coerce_alignment_spans(item))
        return flattened

    token = _read_field(raw_alignment, ("token", "word", "text", "phoneme", "label"))
    start = _read_field(raw_alignment, ("start", "start_time", "t0"))
    end = _read_field(raw_alignment, ("end", "end_time", "t1"))
    if token is None or start is None or end is None:
        raise ValueError("each alignment span needs token/text, start, and end fields")

    confidence = _read_field(raw_alignment, ("confidence", "score", "probability", "prob"))
    char_start = _read_field(raw_alignment, ("char_start", "character_start"))
    char_end = _read_field(raw_alignment, ("char_end", "character_end"))
    line_index = _read_field(raw_alignment, ("line_index", "line"))
    try:
        numeric_start = float(start)
        numeric_end = float(end)
        numeric_confidence = None if confidence is None else float(confidence)
        numeric_char_start = None if char_start is None else int(char_start)
        numeric_char_end = None if char_end is None else int(char_end)
        numeric_line_index = None if line_index is None else int(line_index)
    except (TypeError, ValueError) as exc:
        raise ValueError("alignment timing, score, and character offsets must be numeric") from exc

    if not math.isfinite(numeric_start) or not math.isfinite(numeric_end):
        raise ValueError("alignment start and end must be finite")
    if numeric_confidence is not None and not math.isfinite(numeric_confidence):
        numeric_confidence = None

    return [
        AlignmentSpan(
            token=str(token),
            start=numeric_start,
            end=numeric_end,
            confidence=numeric_confidence,
            char_start=numeric_char_start,
            char_end=numeric_char_end,
            line_index=numeric_line_index,
        )
    ]


def _unit_ranges(units: Sequence[DisplayUnit]) -> tuple[str, list[tuple[int, int]]]:
    reference_parts: list[str] = []
    ranges: list[tuple[int, int]] = []
    cursor = 0
    for unit in units:
        reference_parts.append(unit.normalized)
        end = cursor + len(unit.normalized)
        ranges.append((cursor, end))
        cursor = end
    return "".join(reference_parts), ranges


def _correct_span(span: AlignmentSpan) -> tuple[float, float, tuple[str, ...]]:
    start = span.start
    end = span.end
    flags: tuple[str, ...] = ()
    if end < start:
        start, end = end, start
        flags = ("invalid_time", "timing_adjusted")
    if start < 0:
        start = 0.0
        end = max(start, end)
        flags = _unique_flags(flags, ("invalid_time", "timing_adjusted"))
    return start, end, flags


def _span_confidence(span: AlignmentSpan) -> float:
    # Unknown confidence is deliberately neutral, rather than silently perfect.
    if span.confidence is None:
        return 0.75
    return min(1.0, max(0.0, span.confidence))


def map_alignment_spans(
    units: Sequence[DisplayUnit],
    spans: Sequence[AlignmentSpan] | object,
    *,
    low_confidence_threshold: float = 0.5,
    short_duration_threshold: float = 0.04,
) -> list[UnitInterval]:
    """Map character/word/phoneme spans to display-unit intervals.

    Explicit normalized-reference character offsets take priority. Remaining
    token spans are matched by normalized text. If one word span covers several
    Hangul units, only that span is divided proportionally. Multiple phonemes
    assigned to one character are instead merged from their earliest start to
    latest end, preserving a long sung vowel.
    """

    if not 0.0 <= low_confidence_threshold <= 1.0:
        raise ValueError("low_confidence_threshold must be between 0 and 1")
    if short_duration_threshold < 0:
        raise ValueError("short_duration_threshold cannot be negative")

    coerced_spans = coerce_alignment_spans(spans)
    if not units:
        return []
    if not coerced_spans:
        return [
            UnitInterval(
                unit=unit,
                start=None,
                end=None,
                confidence=0.0,
                flags=("unmatched", "low_confidence"),
            )
            for unit in units
        ]

    reference, ranges = _unit_ranges(units)
    associations: list[set[int]] = [set() for _ in units]
    matched_characters: list[set[int]] = [set() for _ in units]
    explicit_span_indices: set[int] = set()

    # Character offsets are the reliable route for phoneme alignments, whose
    # labels generally cannot be compared directly with orthography.
    for span_index, span in enumerate(coerced_spans):
        if span.char_start is None or span.char_end is None:
            continue
        explicit_span_indices.add(span_index)
        span_start = max(0, span.char_start)
        span_end = max(span_start + 1, span.char_end)
        for unit_index, (unit_start, unit_end) in enumerate(ranges):
            if (
                span.line_index is not None
                and units[unit_index].line_index != span.line_index
            ):
                continue
            overlap_start = max(unit_start, span_start)
            overlap_end = min(unit_end, span_end)
            if overlap_start < overlap_end:
                associations[unit_index].add(span_index)
                matched_characters[unit_index].update(range(overlap_start, overlap_end))

    # WhisperX returns characters grouped by the reference segment that was
    # aligned. Preserve that identity so an occurrence in a repeated chorus
    # cannot slide into an earlier identical lyric line.
    positioned_span_indices = set(explicit_span_indices)
    line_span_indices: dict[int, list[int]] = {}
    for span_index, span in enumerate(coerced_spans):
        if span_index in explicit_span_indices or span.line_index is None:
            continue
        line_span_indices.setdefault(span.line_index, []).append(span_index)

    for line_index, source_indices in line_span_indices.items():
        candidate_units = [
            unit_index
            for unit_index, unit in enumerate(units)
            if unit.line_index == line_index
        ]
        if not candidate_units:
            continue

        local_reference_parts: list[str] = []
        local_ranges: list[tuple[int, int, int]] = []
        cursor = 0
        for unit_index in candidate_units:
            normalized = units[unit_index].normalized
            local_reference_parts.append(normalized)
            local_ranges.append((cursor, cursor + len(normalized), unit_index))
            cursor += len(normalized)

        local_hypothesis_parts: list[str] = []
        local_owners: list[int] = []
        for span_index in source_indices:
            token = normalize_text(coerced_spans[span_index].token)
            local_hypothesis_parts.append(token)
            local_owners.extend([span_index] * len(token))

        local_match = match_text(
            "".join(local_reference_parts), "".join(local_hypothesis_parts)
        )
        for reference_index, hypothesis_index in enumerate(local_match.character_map):
            if hypothesis_index is None or hypothesis_index >= len(local_owners):
                continue
            span_index = local_owners[hypothesis_index]
            for unit_start, unit_end, unit_index in local_ranges:
                if unit_start <= reference_index < unit_end:
                    associations[unit_index].add(span_index)
                    matched_characters[unit_index].add(reference_index + ranges[unit_index][0] - unit_start)
                    break
        positioned_span_indices.update(source_indices)

    # Match unpositioned word/character tokens against the whole reference.
    token_parts: list[str] = []
    hypothesis_owners: list[int] = []
    for span_index, span in enumerate(coerced_spans):
        if span_index in positioned_span_indices:
            continue
        normalized_token = normalize_text(span.token)
        token_parts.append(normalized_token)
        hypothesis_owners.extend([span_index] * len(normalized_token))
    match = match_text(reference, "".join(token_parts))
    for reference_index, hypothesis_index in enumerate(match.character_map):
        if hypothesis_index is None or hypothesis_index >= len(hypothesis_owners):
            continue
        span_index = hypothesis_owners[hypothesis_index]
        for unit_index, (unit_start, unit_end) in enumerate(ranges):
            if unit_start <= reference_index < unit_end:
                associations[unit_index].add(span_index)
                matched_characters[unit_index].add(reference_index)
                break

    span_to_units: dict[int, list[int]] = {}
    for unit_index, source_indices in enumerate(associations):
        for source_index in source_indices:
            span_to_units.setdefault(source_index, []).append(unit_index)

    # Each source span contributes a (possibly divided) interval to its units.
    contributions: list[list[tuple[float, float, int, tuple[str, ...]]]] = [
        [] for _ in units
    ]
    for span_index, attached_units in span_to_units.items():
        span = coerced_spans[span_index]
        span_start, span_end, span_flags = _correct_span(span)
        weights: list[int] = []
        for unit_index in attached_units:
            unit_start, unit_end = ranges[unit_index]
            matched_count = len(matched_characters[unit_index].intersection(range(unit_start, unit_end)))
            weights.append(max(1, matched_count))
        total_weight = sum(weights)
        elapsed_weight = 0
        for unit_index, weight in zip(attached_units, weights):
            contribution_start = span_start + (span_end - span_start) * elapsed_weight / total_weight
            elapsed_weight += weight
            contribution_end = span_start + (span_end - span_start) * elapsed_weight / total_weight
            contributions[unit_index].append(
                (contribution_start, contribution_end, span_index, span_flags)
            )

    intervals: list[UnitInterval] = []
    for unit_index, unit in enumerate(units):
        unit_contributions = contributions[unit_index]
        if not unit_contributions:
            intervals.append(
                UnitInterval(
                    unit=unit,
                    start=None,
                    end=None,
                    confidence=0.0,
                    flags=("unmatched", "low_confidence"),
                )
            )
            continue

        start = min(item[0] for item in unit_contributions)
        end = max(item[1] for item in unit_contributions)
        source_indices = tuple(sorted({item[2] for item in unit_contributions}))
        confidence_sum = sum(_span_confidence(coerced_spans[index]) for index in source_indices)
        source_confidence = confidence_sum / len(source_indices)
        unit_start, unit_end = ranges[unit_index]
        coverage = len(matched_characters[unit_index]) / max(1, unit_end - unit_start)
        confidence = source_confidence * coverage
        flags = _unique_flags(*(item[3] for item in unit_contributions))
        if coverage < 1.0:
            flags = _unique_flags(flags, ("partial_match",))
        if confidence < low_confidence_threshold:
            flags = _unique_flags(flags, ("low_confidence",))
        if end - start < short_duration_threshold:
            flags = _unique_flags(flags, ("very_short",))
        intervals.append(
            UnitInterval(
                unit=unit,
                start=start,
                end=end,
                confidence=confidence,
                flags=flags,
                source_span_indices=source_indices,
            )
        )

    return intervals


def enforce_monotonic(
    intervals: Sequence[UnitInterval],
    *,
    min_duration: float = 0.04,
    max_time: float | None = None,
) -> list[UnitInterval]:
    """Return intervals in display order with no temporal overlap.

    Overlap is resolved only inside the overlapping region. Its boundary is
    weighted by each original duration and confidence, so a long, confident
    sung syllable keeps most of its duration instead of being flattened to an
    equal grid. Completely reversed spans are shifted forward while preserving
    their duration. Unmatched (``None``) timings remain unmatched.
    """

    if min_duration < 0:
        raise ValueError("min_duration cannot be negative")
    if max_time is not None and (not math.isfinite(max_time) or max_time < 0):
        raise ValueError("max_time must be a non-negative finite number")
    output = list(intervals)
    previous_timed_index: int | None = None

    for current_index, original_current in enumerate(output):
        if original_current.start is None or original_current.end is None:
            continue
        current_start = original_current.start
        current_end = original_current.end
        current_flags = original_current.flags
        if current_end < current_start:
            current_start, current_end = current_end, current_start
            current_flags = _unique_flags(current_flags, ("invalid_time", "timing_adjusted"))
        if current_start < 0:
            current_start = 0.0
            current_end = max(current_start, current_end)
            current_flags = _unique_flags(current_flags, ("invalid_time", "timing_adjusted"))
        if max_time is not None and (current_start > max_time or current_end > max_time):
            current_start = min(current_start, max_time)
            current_end = min(current_end, max_time)
            current_flags = _unique_flags(
                current_flags, ("end_clamped", "timing_adjusted")
            )
        current = replace(
            original_current,
            start=current_start,
            end=current_end,
            flags=current_flags,
        )
        output[current_index] = current

        if previous_timed_index is None:
            previous_timed_index = current_index
            continue

        previous = output[previous_timed_index]
        assert previous.start is not None and previous.end is not None
        assert current.start is not None and current.end is not None
        if current.start >= previous.end:
            previous_timed_index = current_index
            continue

        if current.end <= previous.start:
            duration = max(0.0, current.end - current.start)
            shifted_start = previous.end
            shifted_end = shifted_start + duration
            shifted_flags = _unique_flags(
                current.flags, ("out_of_order", "timing_adjusted")
            )
            if max_time is not None and shifted_end > max_time:
                shifted_end = max_time
                shifted_flags = _unique_flags(shifted_flags, ("end_clamped",))
            if shifted_end - shifted_start < min_duration:
                shifted_flags = _unique_flags(shifted_flags, ("very_short",))
            current = replace(
                current,
                start=shifted_start,
                end=shifted_end,
                flags=shifted_flags,
            )
            output[current_index] = current
            previous_timed_index = current_index
            continue

        overlap_start = current.start
        overlap_end = previous.end
        previous_duration = max(min_duration, previous.end - previous.start)
        current_duration = max(min_duration, current.end - current.start)
        previous_weight = previous_duration * (0.5 + 0.5 * previous.confidence)
        current_weight = current_duration * (0.5 + 0.5 * current.confidence)
        boundary = overlap_start + (overlap_end - overlap_start) * (
            previous_weight / (previous_weight + current_weight)
        )

        lower_bound = previous.start
        upper_bound = current.end
        if upper_bound - lower_bound >= 2 * min_duration:
            boundary = max(lower_bound + min_duration, min(upper_bound - min_duration, boundary))
        else:
            boundary = max(lower_bound, min(upper_bound, boundary))

        previous_flags = _unique_flags(previous.flags, ("overlap_adjusted", "timing_adjusted"))
        current_flags = _unique_flags(current.flags, ("overlap_adjusted", "timing_adjusted"))
        adjusted_previous = replace(previous, end=boundary, flags=previous_flags)
        adjusted_current = replace(current, start=boundary, flags=current_flags)
        if boundary - previous.start < min_duration:
            adjusted_previous = replace(
                adjusted_previous,
                flags=_unique_flags(adjusted_previous.flags, ("very_short",)),
            )
        if current.end - boundary < min_duration:
            adjusted_current = replace(
                adjusted_current,
                flags=_unique_flags(adjusted_current.flags, ("very_short",)),
            )
        output[previous_timed_index] = adjusted_previous
        output[current_index] = adjusted_current
        previous_timed_index = current_index

    return output


def _weighted_confidence(intervals: Sequence[UnitInterval]) -> float:
    if not intervals:
        return 0.0
    total_weight = 0
    total = 0.0
    for interval in intervals:
        weight = max(1, len(interval.unit.normalized))
        total_weight += weight
        total += interval.confidence * weight
    return total / total_weight


def build_alignment(
    lyrics: str | Sequence[LyricLine],
    raw_alignment: object,
    *,
    low_confidence_threshold: float = 0.5,
    min_duration: float = 0.04,
) -> AlignmentResult:
    """Build line and display-unit karaoke timings from a reference lyric.

    The returned dataclass is independent of model adapters and can be emitted
    directly as JSON through :meth:`AlignmentResult.to_dict`.
    """

    if isinstance(lyrics, str):
        lines = parse_reference_lyrics(lyrics)
    else:
        lines = list(lyrics)
        if not all(isinstance(line, LyricLine) for line in lines):
            raise TypeError("lyrics must be text or a sequence of LyricLine objects")

    units: list[DisplayUnit] = []
    for line in lines:
        units.extend(split_display_units(line.text, line_index=line.index))

    spans = coerce_alignment_spans(raw_alignment)
    mapped = map_alignment_spans(
        units,
        spans,
        low_confidence_threshold=low_confidence_threshold,
        short_duration_threshold=min_duration,
    )
    source_ceiling = max(
        (max(0.0, span.start, span.end) for span in spans),
        default=None,
    )
    adjusted = enforce_monotonic(
        mapped, min_duration=min_duration, max_time=source_ceiling
    )

    line_intervals: list[LineInterval] = []
    for line in lines:
        line_units = tuple(interval for interval in adjusted if interval.unit.line_index == line.index)
        timed_units = [unit for unit in line_units if unit.start is not None and unit.end is not None]
        start = min((unit.start for unit in timed_units), default=None)
        end = max((unit.end for unit in timed_units), default=None)
        confidence = _weighted_confidence(line_units)
        flags: tuple[str, ...] = ()
        if not line_units:
            flags = ("no_display_units",)
        elif len(timed_units) != len(line_units):
            flags = ("partial_alignment",)
        if confidence < low_confidence_threshold:
            flags = _unique_flags(flags, ("low_confidence",))
        line_intervals.append(
            LineInterval(
                line=line,
                start=start,
                end=end,
                units=line_units,
                confidence=confidence,
                flags=flags,
            )
        )

    reference_text = "".join(unit.normalized for unit in units)
    hypothesis_text = "".join(normalize_text(span.token) for span in spans)
    similarity = match_text(reference_text, hypothesis_text).score
    confidence = _weighted_confidence(adjusted)
    flags: tuple[str, ...] = ()
    if not spans:
        flags = ("no_alignment",)
    if any(interval.start is None for interval in adjusted):
        flags = _unique_flags(flags, ("partial_alignment",))
    if similarity < 0.75 and reference_text:
        flags = _unique_flags(flags, ("text_mismatch",))
    if confidence < low_confidence_threshold and units:
        flags = _unique_flags(flags, ("low_confidence",))

    return AlignmentResult(
        lines=tuple(line_intervals),
        units=tuple(adjusted),
        confidence=confidence,
        text_similarity=similarity,
        flags=flags,
    )


def extend_document_holds(
    document: Mapping[str, Any],
    *,
    energy_profile: "EnergyProfile | None" = None,
    activity_intervals: Sequence[Sequence[float]] = (),
    max_time: float | None = None,
    activity_tolerance: float = 0.12,
    minimum_extension: float = 0.01,
    config: HoldConfig | None = None,
) -> dict[str, Any]:
    """Convert CTC character ends into karaoke-style held-note ends.

    CTC is good at locating a syllable onset but often assigns only one or two
    frames to a long sung vowel. When a fine RMS profile is supplied, every
    syllable is extended only while the separated vocal still has energy. A
    release is the first 150 ms sustained quiet region after the CTC end. The
    The next syllable onset and audio duration are hard caps; callers may also
    configure a maximum extension when their vocal stem is noisy.

    ``activity_intervals`` remains a coarse fallback for callers that cannot
    provide an RMS profile. In that mode, an inner syllable owns the time to
    the next onset and a line-final syllable may use the containing activity
    interval's end.

    The returned JSON-like mapping is a deep copy. When an end is extended the
    original CTC boundary is retained as ``alignment_end`` and the unit receives
    the ``hold_extended`` review flag.
    """

    config = config or HoldConfig()
    if max_time is not None and (not math.isfinite(max_time) or max_time < 0):
        raise ValueError("max_time must be a non-negative finite number")
    if activity_tolerance < 0 or minimum_extension < 0:
        raise ValueError("hold extension tolerances cannot be negative")

    normalized_activity: list[tuple[float, float]] = []
    for index, interval in enumerate(activity_intervals):
        if len(interval) != 2:
            raise ValueError(f"activity interval {index} must contain start and end")
        start, end = float(interval[0]), float(interval[1])
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
            raise ValueError(f"activity interval {index} is invalid")
        normalized_activity.append((start, end))
    normalized_activity.sort()

    normalized_profile: tuple[
        tuple[float, ...], float, float, float, float, float
    ] | None = None
    if energy_profile is not None:
        try:
            values = tuple(float(value) for value in energy_profile.rms)
            duration = float(energy_profile.duration)
            frame_seconds = float(energy_profile.frame_seconds)
            hop_seconds = float(energy_profile.hop_seconds)
            offset_seconds = float(energy_profile.time_offset_seconds)
            global_threshold = float(energy_profile.global_threshold)
        except (AttributeError, TypeError, ValueError) as exc:
            raise ValueError("energy_profile has invalid fields") from exc
        numeric_fields = (
            duration,
            frame_seconds,
            hop_seconds,
            offset_seconds,
            global_threshold,
        )
        if (
            any(not math.isfinite(value) for value in (*values, *numeric_fields))
            or any(value < 0 for value in values)
            or duration < 0
            or frame_seconds <= 0
            or hop_seconds <= 0
            or offset_seconds < 0
            or global_threshold < 0
        ):
            raise ValueError("energy_profile values must be finite and non-negative")
        normalized_profile = (
            values,
            duration,
            frame_seconds,
            hop_seconds,
            offset_seconds,
            global_threshold,
        )

    payload = deepcopy(dict(document))
    raw_lines = payload.get("lines", [])
    if not isinstance(raw_lines, list):
        raise TypeError("document lines must be a list")

    timed_units: list[tuple[int, dict[str, Any]]] = []
    for line_index, line in enumerate(raw_lines):
        if not isinstance(line, dict):
            continue
        units = line.get("syllables", line.get("units", []))
        if not isinstance(units, list):
            continue
        for unit in units:
            if not isinstance(unit, dict):
                continue
            if unit.get("start") is None or unit.get("end") is None:
                continue
            timed_units.append((line_index, unit))

    def activity_release(end: float) -> float | None:
        for interval_start, interval_end in normalized_activity:
            if (
                interval_start <= end + activity_tolerance
                and interval_end >= end - activity_tolerance
            ):
                return interval_end
        return None

    def adaptive_release(start: float, alignment_end: float, limit: float) -> float | None:
        if normalized_profile is None or limit <= alignment_end:
            return None
        values, _, _, hop, offset, global_threshold = normalized_profile
        if not values or global_threshold <= 0:
            return None

        def index_at(timestamp: float) -> int:
            relative = (timestamp - offset) / hop
            return min(len(values), max(0, math.ceil(relative - 1e-9)))

        segment_start = index_at(start)
        segment_end = index_at(limit)
        segment = values[segment_start:segment_end]
        if not segment:
            return None
        ordered = sorted(segment)
        peak_index = min(len(ordered) - 1, round((len(ordered) - 1) * 0.95))
        local_threshold = 0.15 * ordered[peak_index]
        threshold_floor = global_threshold * (0.02 / 0.18)
        threshold = min(
            global_threshold,
            max(local_threshold, threshold_floor),
        )
        if threshold <= 0:
            return None

        evidence_start = index_at(alignment_end)
        evidence_end = index_at(
            min(limit, alignment_end + config.evidence_probe_ms / 1000.0)
        )
        required_evidence = max(
            1, math.ceil((config.evidence_ms / 1000.0) / hop)
        )
        evidence = sum(
            value >= threshold for value in values[evidence_start:evidence_end]
        )
        if evidence < required_evidence:
            return None

        required_quiet = max(
            1, math.ceil((config.release_silence_ms / 1000.0) / hop)
        )
        quiet_run = 0
        for index in range(evidence_start, segment_end):
            if values[index] < threshold:
                quiet_run += 1
                if quiet_run >= required_quiet:
                    release_index = index - quiet_run + 1
                    release = offset + release_index * hop
                    return min(limit, max(alignment_end, release))
            else:
                quiet_run = 0
        return limit

    for position, (line_index, unit) in enumerate(timed_units):
        start = float(unit["start"])
        current_end = float(unit["end"])
        alignment_end = float(unit.get("alignment_end", current_end))
        following = timed_units[position + 1] if position + 1 < len(timed_units) else None
        following_start = float(following[1]["start"]) if following is not None else None
        caps: list[float] = []
        if config.maximum_extension_seconds is not None:
            caps.append(alignment_end + config.maximum_extension_seconds)
        elif normalized_profile is None:
            caps.append(
                alignment_end + config.fallback_maximum_extension_seconds
            )
        if following_start is not None:
            caps.append(following_start)
        if max_time is not None:
            caps.append(max_time)
        if normalized_profile is not None:
            caps.append(normalized_profile[1])
        limit = min(caps)
        target = current_end

        if limit > current_end:
            target = max(
                target,
                min(limit, start + config.minimum_visual_seconds),
            )

        if normalized_profile is not None:
            release = adaptive_release(start, alignment_end, limit)
            if release is not None:
                target = max(target, release)
        elif following is not None and following[0] == line_index:
            target = max(target, min(limit, float(following[1]["start"])))
        else:
            release = activity_release(alignment_end)
            if release is not None:
                target = max(target, min(limit, release))

        if target > current_end + minimum_extension:
            unit.setdefault("alignment_end", alignment_end)
            unit["end"] = round(target, 3)
            flags = [str(flag) for flag in unit.get("flags", [])]
            if "hold_extended" not in flags:
                flags.append("hold_extended")
            unit["flags"] = flags

    for line_index, line in enumerate(raw_lines):
        if not isinstance(line, dict):
            continue
        line_units = [unit for index, unit in timed_units if index == line_index]
        if line_units:
            line["start"] = min(float(unit["start"]) for unit in line_units)
            line["end"] = max(float(unit["end"]) for unit in line_units)

    metadata = payload.setdefault("metadata", {})
    if isinstance(metadata, dict):
        applied_count = sum(
            "hold_extended" in [str(flag) for flag in unit.get("flags", [])]
            for _, unit in timed_units
        )
        method = (
            "adaptive_rms_release"
            if normalized_profile is not None
            else "onset_to_onset+activity_release"
        )
        metadata["hold_extension"] = {
            "method": method,
            "applied_count": applied_count,
            "release_silence_ms": config.release_silence_ms,
            "evidence_ms": config.evidence_ms,
            "evidence_probe_ms": config.evidence_probe_ms,
            "maximum_extension_seconds": config.maximum_extension_seconds,
            "fallback_maximum_extension_seconds": (
                config.fallback_maximum_extension_seconds
            ),
        }
        if applied_count:
            metadata["duration_policy"] = (
                "adaptive_vocal_energy_release"
                if normalized_profile is not None
                else "onset_to_onset+vocal_energy_release"
            )
        else:
            metadata.setdefault("duration_policy", "alignment")
    return payload


__all__ = [
    "AlignmentResult",
    "AlignmentSpan",
    "HoldConfig",
    "LineInterval",
    "UnitInterval",
    "build_alignment",
    "coerce_alignment_spans",
    "enforce_monotonic",
    "extend_document_holds",
    "map_alignment_spans",
]
