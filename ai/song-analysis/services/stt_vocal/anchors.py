"""Build coarse lyric-line windows from timestamped ASR segments.

Whisper is deliberately used only as an acoustic anchor here.  Its text may be
wrong; a monotonic global alignment maps whatever it recognised back to the
reference lyrics.  The resulting windows are then suitable input for a real
CTC/phoneme forced aligner.
"""

from __future__ import annotations

from array import array
from collections import Counter
from dataclasses import dataclass
from math import ceil
from typing import Any, Iterable, Mapping, Sequence, TypeVar

from .text import LyricLine, normalize_text, parse_reference_lyrics


SegmentT = TypeVar("SegmentT")


@dataclass(frozen=True, slots=True)
class TimedCharacter:
    char: str
    start: float
    end: float
    segment_index: int


@dataclass(frozen=True, slots=True)
class AnchorWindow:
    line_index: int
    text: str
    start: float
    end: float
    confidence: float
    matched_characters: int
    total_characters: int
    source: str = "whisper"

    def as_segment(self) -> dict[str, object]:
        """Return the shape expected by ``whisperx.align``."""

        return {"start": self.start, "end": self.end, "text": self.text}


def filter_implausible_anchor_segments(
    segments: Iterable[SegmentT],
    *,
    near_zero_duration: float = 0.05,
    minimum_rate_characters: int = 8,
    maximum_characters_per_second: float = 24.0,
) -> tuple[list[SegmentT], list[dict[str, Any]]]:
    """Drop only mechanically implausible Whisper segments.

    The filter is deliberately conservative: repeated text and low confidence
    alone are not rejected because both are normal in singing.  It catches the
    characteristic hallucinations where a sentence is assigned a zero-length
    or impossibly short interval, plus high ``no_speech_prob`` segments whose
    log probability is also weak.  Rejections contain no lyric text so output
    metadata does not copy hallucinated captions.
    """

    if near_zero_duration < 0:
        raise ValueError("near_zero_duration cannot be negative")
    if minimum_rate_characters < 1:
        raise ValueError("minimum_rate_characters must be positive")
    if maximum_characters_per_second <= 0:
        raise ValueError("maximum_characters_per_second must be positive")

    def field(segment: object, name: str, default: Any = None) -> Any:
        if isinstance(segment, Mapping):
            return segment.get(name, default)
        return getattr(segment, name, default)

    kept: list[SegmentT] = []
    rejected: list[dict[str, Any]] = []
    for index, segment in enumerate(segments):
        text = normalize_text(str(field(segment, "text", "")), keep_spaces=False)
        start = float(field(segment, "start", 0.0))
        end = float(field(segment, "end", start))
        duration = max(0.0, end - start)
        reasons: list[str] = []
        if len(text) >= 2 and duration <= near_zero_duration:
            reasons.append("near_zero_duration")
        elif (
            len(text) >= minimum_rate_characters
            and len(text) / max(duration, 1e-9) > maximum_characters_per_second
        ):
            reasons.append("implausible_text_rate")

        no_speech = field(segment, "no_speech_prob")
        avg_logprob = field(segment, "avg_logprob")
        if (
            no_speech is not None
            and float(no_speech) >= 0.95
            and (avg_logprob is None or float(avg_logprob) < -0.5)
        ):
            reasons.append("high_no_speech_probability")

        if reasons:
            rejected.append(
                {
                    "index": index,
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "reasons": reasons,
                }
            )
        else:
            kept.append(segment)
    return kept, rejected


def timed_characters_from_segments(
    segments: Iterable[Mapping[str, object]],
) -> list[TimedCharacter]:
    """Spread each ASR segment's normalized characters over its time range.

    These times are intentionally coarse.  They are only used to bound a later
    forced-alignment search, never as final karaoke timings.
    """

    result: list[TimedCharacter] = []
    for segment_index, segment in enumerate(segments):
        text = normalize_text(str(segment.get("text", "")), keep_spaces=False)
        if not text:
            continue
        start = max(0.0, float(segment.get("start", 0.0)))
        end = max(start, float(segment.get("end", start)))
        width = (end - start) / len(text) if end > start else 0.0
        for index, char in enumerate(text):
            char_start = start + width * index
            char_end = start + width * (index + 1)
            result.append(
                TimedCharacter(
                    char=char,
                    start=char_start,
                    end=char_end,
                    segment_index=segment_index,
                )
            )
    return result


def global_character_alignment(
    hypothesis: Sequence[str], reference: Sequence[str]
) -> list[int | None]:
    """Map every reference character to a hypothesis index, monotonically.

    A full Levenshtein matrix is retained for deterministic backtracking.  The
    matrix uses compact unsigned integers so a normal song stays well below a
    few megabytes instead of allocating millions of Python integer objects.
    Exact matches are exposed; substitutions remain unmatched.
    """

    n, m = len(hypothesis), len(reference)
    if m == 0:
        return []
    if n == 0:
        return [None] * m

    rows: list[array] = [array("I", range(m + 1))]
    for i in range(1, n + 1):
        previous = rows[-1]
        current = array("I", [i])
        hyp_char = hypothesis[i - 1]
        for j in range(1, m + 1):
            substitution = previous[j - 1] + (hyp_char != reference[j - 1])
            deletion = previous[j] + 1
            insertion = current[j - 1] + 1
            current.append(min(substitution, deletion, insertion))
        rows.append(current)

    matches: list[int | None] = [None] * m
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            equal = hypothesis[i - 1] == reference[j - 1]
            substitution_cost = rows[i - 1][j - 1] + (not equal)
            if rows[i][j] == substitution_cost:
                if equal:
                    matches[j - 1] = i - 1
                i -= 1
                j -= 1
                continue
        if i > 0 and rows[i][j] == rows[i - 1][j] + 1:
            i -= 1
        elif j > 0:
            j -= 1
        else:  # defensive guard; the recurrence should make this unreachable
            i -= 1
    return matches


_TRAILING_VOCALIZATIONS = ("umm", "um", "ooh", "oh", "woo", "uh", "ah")


def direct_text_match(
    hypothesis: str,
    reference: str,
) -> tuple[float, int, str] | None:
    """Return a conservative full-line match for normalized lyric text."""

    if not hypothesis or not reference:
        return None
    if hypothesis == reference:
        return 1.0, len(reference), "exact"

    for vocalization in _TRAILING_VOCALIZATIONS:
        if (
            reference == hypothesis + vocalization
            and len(hypothesis) >= 6
            and len(hypothesis) / len(reference) >= 0.78
        ):
            return len(hypothesis) / len(reference), len(hypothesis), "trailing_vocalization"

    maximum_length = max(len(hypothesis), len(reference))
    length_ratio = min(len(hypothesis), len(reference)) / maximum_length
    if maximum_length < 6 or length_ratio < 0.85:
        return None
    distance = _levenshtein_distance(hypothesis, reference)
    if distance > 1:
        return None
    similarity = 1.0 - distance / maximum_length
    if similarity < 0.85:
        return None
    return similarity, maximum_length - distance, "near"


def _levenshtein_distance(left: str, right: str) -> int:
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for left_index, left_character in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_character in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1]
                    + (left_character != right_character),
                )
            )
        previous = current
    return previous[-1]


def _direct_segment_line_matches(
    lines: Sequence[LyricLine],
    segments: Sequence[Mapping[str, object]],
    *,
    minimum_characters: int = 4,
) -> list[tuple[int, int, float, int, str]]:
    """Select strong, unique line/segment pairs in monotonic order.

    Whole-song character alignment remains useful when Whisper combines or
    splits lyric lines.  It can, however, consume a perfectly recognised late
    verse after a long omission.  This deliberately conservative second signal
    prefers exact phrases and permits only a one-edit full-line error or a
    missing trailing vocalization.  Every candidate must be unique and clearly
    better than its runner-up; combined segments and repeated choruses stay
    with the global matcher.
    """

    if minimum_characters < 1:
        raise ValueError("minimum_characters must be positive")

    line_texts = [normalize_text(line.text, keep_spaces=False) for line in lines]
    line_counts = Counter(line_texts)
    segment_texts = [
        normalize_text(str(segment.get("text", "")), keep_spaces=False)
        for segment in segments
    ]
    segment_counts = Counter(segment_texts)
    provisional: list[tuple[int, int, float, int, float, str]] = []
    for segment_index, hypothesis in enumerate(segment_texts):
        if (
            len(hypothesis) < minimum_characters
            or segment_counts[hypothesis] != 1
        ):
            continue
        segment_options: list[tuple[int, int, float, int, float, str]] = []
        for line_index, reference in enumerate(line_texts):
            if (
                len(reference) < minimum_characters
                or line_counts[reference] != 1
            ):
                continue
            text_match = direct_text_match(hypothesis, reference)
            if text_match is None:
                continue
            similarity, matched, kind = text_match
            # Character count rewards full lines over incidental short phrases.
            weight = similarity * matched
            segment_options.append(
                (segment_index, line_index, similarity, matched, weight, kind)
            )

        segment_options.sort(key=lambda item: (item[2], item[3]), reverse=True)
        if not segment_options:
            continue
        if (
            segment_options[0][5] != "exact"
            and len(segment_options) > 1
            and segment_options[0][2] - segment_options[1][2] < 0.12
        ):
            continue
        provisional.append(segment_options[0])

    candidates: list[tuple[int, int, float, int, float, str]] = []
    by_line: dict[int, list[tuple[int, int, float, int, float, str]]] = {}
    for candidate in provisional:
        by_line.setdefault(candidate[1], []).append(candidate)
    for options in by_line.values():
        options.sort(key=lambda item: (item[2], item[3]), reverse=True)
        if (
            options[0][5] != "exact"
            and len(options) > 1
            and options[0][2] - options[1][2] < 0.12
        ):
            continue
        candidates.append(options[0])

    if not candidates:
        return []

    candidates.sort(key=lambda item: (item[0], item[1]))
    scores = [candidate[4] for candidate in candidates]
    previous: list[int | None] = [None] * len(candidates)
    for index, candidate in enumerate(candidates):
        for earlier_index in range(index):
            earlier = candidates[earlier_index]
            if earlier[0] >= candidate[0] or earlier[1] >= candidate[1]:
                continue
            proposed = scores[earlier_index] + candidate[4]
            if proposed > scores[index] + 1e-9:
                scores[index] = proposed
                previous[index] = earlier_index

    cursor = max(range(len(candidates)), key=lambda index: scores[index])
    selected: list[tuple[int, int, float, int, str]] = []
    while True:
        segment_index, line_index, similarity, matched, _, kind = candidates[cursor]
        selected.append((segment_index, line_index, similarity, matched, kind))
        prior = previous[cursor]
        if prior is None:
            break
        cursor = prior
    selected.reverse()
    return selected


def derive_line_windows(
    lyrics: str | Sequence[LyricLine],
    asr_segments: Iterable[Mapping[str, object]],
    duration: float,
    *,
    head_padding: float = 0.45,
    tail_padding: float = 0.65,
    direct_head_padding: float = 0.12,
    direct_tail_padding: float = 0.30,
    minimum_coverage: float = 0.25,
) -> list[AnchorWindow]:
    """Derive original-timeline windows for every non-empty lyric line.

    Lines with weak/no ASR evidence are interpolated between reliable
    neighbours.  The output is monotonic and bounded by ``duration``; gaps are
    not concatenated, so all timestamps remain relative to the source track.
    """

    if duration <= 0:
        raise ValueError("duration must be positive")
    lines = parse_reference_lyrics(lyrics) if isinstance(lyrics, str) else list(lyrics)
    if not lines:
        return []

    segment_list = list(asr_segments)
    timed = timed_characters_from_segments(segment_list)
    hypothesis = [item.char for item in timed]

    reference: list[str] = []
    reference_line: list[int] = []
    line_lengths: list[int] = []
    for local_index, line in enumerate(lines):
        normalized = normalize_text(line.text, keep_spaces=False)
        line_lengths.append(len(normalized))
        reference.extend(normalized)
        reference_line.extend([local_index] * len(normalized))

    matches = global_character_alignment(hypothesis, reference)
    evidence: list[list[TimedCharacter]] = [[] for _ in lines]
    for reference_index, hypothesis_index in enumerate(matches):
        if hypothesis_index is not None:
            evidence[reference_line[reference_index]].append(timed[hypothesis_index])

    raw: list[tuple[float, float, float, int] | None] = []
    for index, chars in enumerate(evidence):
        total = line_lengths[index]
        matched = len(chars)
        coverage = matched / total if total else 0.0
        required = max(1, ceil(total * minimum_coverage))
        if matched < required:
            raw.append(None)
            continue
        raw.append(
            (
                max(0.0, min(char.start for char in chars) - head_padding),
                min(duration, max(char.end for char in chars) + tail_padding),
                coverage,
                matched,
            )
        )

    raw_sources: list[str | None] = ["whisper" if item else None for item in raw]

    # A whole-song edit alignment can lose its place after a long omission and
    # consume a correctly transcribed late verse at the wrong lyric occurrence.
    # Restore strong, unique segment/line pairs before interpolating gaps.  The
    # tighter asymmetric padding is intentional: too much audio before a sung
    # line can make CTC attach the first syllable to an unrelated preceding
    # sound, while a small tail helps it finish a held final syllable.
    for (
        segment_index,
        line_index,
        _similarity,
        matched,
        match_kind,
    ) in _direct_segment_line_matches(lines, segment_list):
        segment = segment_list[segment_index]
        segment_start = max(0.0, float(segment.get("start", 0.0)))
        segment_end = max(segment_start, float(segment.get("end", segment_start)))

        raw_words = segment.get("words", ())
        if isinstance(raw_words, Sequence) and not isinstance(raw_words, (str, bytes)):
            word_bounds: list[tuple[float, float]] = []
            for word in raw_words:
                if not isinstance(word, Mapping) or "start" not in word or "end" not in word:
                    continue
                word_start = max(0.0, float(word["start"]))
                word_end = max(word_start, float(word["end"]))
                word_bounds.append((word_start, word_end))
            if word_bounds:
                segment_start = min(start for start, _ in word_bounds)
                segment_end = max(end for _, end in word_bounds)

        total = line_lengths[line_index]
        coverage = matched / total if total else 0.0
        existing = raw[line_index]
        if (
            match_kind != "exact"
            and existing is not None
            and coverage < existing[2] + 0.20
        ):
            continue
        raw[line_index] = (
            max(0.0, segment_start - direct_head_padding),
            min(duration, segment_end + direct_tail_padding),
            coverage,
            matched,
        )
        raw_sources[line_index] = "whisper_direct"

    # A weaker global match on either side must not push a direct anchor away
    # from its observed time during the final monotonic pass.  Discard only
    # global starts that cross a direct anchor in lyric order; they will be
    # reconstructed by the interpolation step below.
    direct_indices = [
        index for index, source in enumerate(raw_sources) if source == "whisper_direct"
    ]
    for index, item in enumerate(raw):
        if item is None or raw_sources[index] != "whisper":
            continue
        previous_direct = next(
            (candidate for candidate in reversed(direct_indices) if candidate < index),
            None,
        )
        following_direct = next(
            (candidate for candidate in direct_indices if candidate > index),
            None,
        )
        crosses_previous = (
            previous_direct is not None
            and item[0] < raw[previous_direct][0]  # type: ignore[index]
        )
        crosses_following = (
            following_direct is not None
            and item[0] > raw[following_direct][0]  # type: ignore[index]
        )
        if crosses_previous or crosses_following:
            raw[index] = None
            raw_sources[index] = None

    starts: list[float | None] = [item[0] if item else None for item in raw]
    ends: list[float | None] = [item[1] if item else None for item in raw]

    # Fill weak lines.  Character-count weights give long lines proportionally
    # more room while maintaining the occurrence order of repeated choruses.
    for index in range(len(lines)):
        if raw[index] is not None:
            continue
        previous = next((i for i in range(index - 1, -1, -1) if raw[i] is not None), None)
        following = next(
            (i for i in range(index + 1, len(lines)) if raw[i] is not None), None
        )
        if previous is not None and following is not None:
            left = float(ends[previous])
            right = float(starts[following])
            if right <= left:
                left = float(starts[previous])
                right = float(ends[following])
            weights = [max(1, line_lengths[i]) for i in range(previous + 1, following)]
            total_weight = sum(weights) or 1
            before = sum(weights[: index - previous - 1])
            through = before + weights[index - previous - 1]
            starts[index] = left + (right - left) * before / total_weight
            ends[index] = left + (right - left) * through / total_weight
        elif previous is not None:
            estimated = max(1.5, min(8.0, line_lengths[index] * 0.45))
            starts[index] = float(ends[previous])
            ends[index] = min(duration, float(starts[index]) + estimated)
        elif following is not None:
            estimated = max(1.5, min(8.0, line_lengths[index] * 0.45))
            ends[index] = float(starts[following])
            starts[index] = max(0.0, float(ends[index]) - estimated)
        else:
            total_weight = sum(max(1, length) for length in line_lengths)
            before = sum(max(1, length) for length in line_lengths[:index])
            through = before + max(1, line_lengths[index])
            starts[index] = duration * before / total_weight
            ends[index] = duration * through / total_weight

    # Enforce monotonic starts without forcing adjacent lines to touch.  A tiny
    # positive window is sufficient for downstream validation to give a clear
    # low-confidence result rather than a negative or reversed interval.
    windows: list[AnchorWindow] = []
    previous_start = 0.0
    minimum_window = min(0.05, duration)
    latest_start = max(0.0, duration - minimum_window)
    for index, line in enumerate(lines):
        start = max(previous_start, min(latest_start, float(starts[index])))
        end = max(start + minimum_window, min(duration, float(ends[index])))
        end = min(duration, end)
        matched = raw[index][3] if raw[index] else 0
        coverage = raw[index][2] if raw[index] else 0.0
        windows.append(
            AnchorWindow(
                line_index=line.index,
                text=line.text,
                start=round(start, 3),
                end=round(end, 3),
                confidence=round(coverage, 4),
                matched_characters=matched,
                total_characters=line_lengths[index],
                source=raw_sources[index] or "interpolated",
            )
        )
        previous_start = start
    return windows


def anchor_quality(windows: Sequence[AnchorWindow]) -> float:
    """Weighted fraction of reference characters anchored by Whisper."""

    total = sum(window.total_characters for window in windows)
    if total == 0:
        return 0.0
    matched = sum(window.matched_characters for window in windows)
    return matched / total
