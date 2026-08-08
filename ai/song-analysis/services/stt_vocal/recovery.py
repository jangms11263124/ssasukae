"""Targeted Whisper retries for lyric blocks missed by a long decode pass."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from math import ceil, floor
from statistics import fmean
from typing import Sequence

from .adapters import AdapterSegment, AudioClip
from .anchors import AnchorWindow, direct_text_match
from .text import LyricLine, normalize_text


@dataclass(frozen=True, slots=True)
class RecoveryCandidate:
    """A retry segment together with the source clip that produced it."""

    segment: AdapterSegment
    clip: AudioClip


def plan_recovery_clips(
    windows: Sequence[AnchorWindow],
    duration: float,
    *,
    clip_seconds: float = 25.0,
    maximum_stride_seconds: float = 15.0,
    head_context_seconds: float = 5.0,
    tail_context_seconds: float = 4.0,
    minimum_block_lines: int = 2,
    minimum_block_seconds: float = 8.0,
) -> list[AudioClip]:
    """Cover substantial interpolated lyric blocks with short retry clips.

    The first long Whisper pass remains the inexpensive default.  Only blocks
    with no reliable anchor are retried.  Starts are distributed evenly so the
    final clip ends exactly at the requested recovery boundary instead of
    leaving a short, low-context tail clip.
    """

    if duration <= 0:
        raise ValueError("duration must be positive")
    if clip_seconds <= 0 or maximum_stride_seconds <= 0:
        raise ValueError("clip and stride durations must be positive")
    if head_context_seconds < 0 or tail_context_seconds < 0:
        raise ValueError("recovery context cannot be negative")
    if minimum_block_lines < 1 or minimum_block_seconds < 0:
        raise ValueError("invalid recovery block threshold")

    blocks: list[list[AnchorWindow]] = []
    current: list[AnchorWindow] = []
    for window in windows:
        if window.source == "interpolated":
            current.append(window)
        elif current:
            blocks.append(current)
            current = []
    if current:
        blocks.append(current)

    clips: list[AudioClip] = []
    for block in blocks:
        block_seconds = max(0.0, block[-1].end - block[0].start)
        if len(block) < minimum_block_lines and block_seconds < minimum_block_seconds:
            continue
        recovery_start = max(0.0, block[0].start - head_context_seconds)
        recovery_end = min(duration, block[-1].end + tail_context_seconds)
        span = recovery_end - recovery_start
        if span <= 0:
            continue
        if span <= clip_seconds:
            starts = [recovery_start]
            effective_clip_seconds = span
        else:
            travel = span - clip_seconds
            count = ceil(travel / maximum_stride_seconds) + 1
            spacing = travel / (count - 1)
            starts = [recovery_start + spacing * index for index in range(count)]
            effective_clip_seconds = clip_seconds
        clips.extend(
            _quantized_clip(start, effective_clip_seconds, duration)
            for start in starts
        )

    # Adjacent uncertain blocks can expand into the same retry interval.
    unique: dict[tuple[float, float], AudioClip] = {}
    for clip in clips:
        key = (round(clip.start, 3), round(clip.end, 3))
        unique[key] = clip
    return sorted(unique.values(), key=lambda clip: (clip.start, clip.end))


def _quantized_clip(start: float, seconds: float, duration: float) -> AudioClip:
    """Use stable whole-second decode boundaries for repeatable retries."""

    quantized_start = max(0.0, float(floor(start)))
    quantized_end = min(duration, quantized_start + seconds)
    if quantized_end <= quantized_start:
        quantized_start = max(0.0, duration - seconds)
        quantized_end = duration
    return AudioClip(quantized_start, quantized_end)


def select_recovery_segments(
    lines: Sequence[LyricLine],
    existing: Sequence[AdapterSegment],
    candidates: Sequence[RecoveryCandidate],
) -> list[AdapterSegment]:
    """Choose one safe supplemental anchor per previously absent lyric line.

    Retry output is not appended wholesale: doing that would duplicate verses
    and corrupt the whole-song edit alignment.  Exact normalized matches are
    preferred; a unique one-edit full-line error or omitted trailing ``umm``/
    ``oh``-style vocalization is also safe.  If the initial pass already
    emitted the exact phrase, recovery does not second-guess it.
    """

    line_texts = [normalize_text(line.text, keep_spaces=False) for line in lines]
    line_counts = Counter(line_texts)
    existing_counts = Counter(
        normalize_text(segment.text, keep_spaces=False) for segment in existing
    )
    eligible = {
        text
        for text, count in line_counts.items()
        if text and count == 1 and existing_counts[text] == 0 and len(text) >= 4
    }
    grouped: dict[str, list[tuple[RecoveryCandidate, float, int]]] = {}
    for candidate in candidates:
        hypothesis = normalize_text(candidate.segment.text, keep_spaces=False)
        options: list[tuple[str, float, int, str]] = []
        for reference in eligible:
            text_match = direct_text_match(hypothesis, reference)
            if text_match is None:
                continue
            similarity, matched, kind = text_match
            options.append((reference, similarity, matched, kind))
        options.sort(key=lambda item: (item[1], item[2]), reverse=True)
        if not options:
            continue
        if (
            options[0][3] != "exact"
            and len(options) > 1
            and options[0][1] - options[1][1] < 0.12
        ):
            continue
        reference, similarity, matched, _ = options[0]
        grouped.setdefault(reference, []).append((candidate, similarity, matched))

    selected: list[AdapterSegment] = []
    for text in line_texts:
        options = grouped.get(text)
        if not options:
            continue
        winner, _, _ = max(
            options,
            key=lambda option: (
                option[1],
                option[2],
                *_candidate_quality(option[0]),
            ),
        )
        selected.append(winner.segment)
    return sorted(selected, key=lambda segment: (segment.start, segment.end))


def _candidate_quality(candidate: RecoveryCandidate) -> tuple[float, ...]:
    word_scores = [
        word.score for word in candidate.segment.words if word.score is not None
    ]
    mean_word_score = fmean(word_scores) if word_scores else -1.0
    average_log_probability = (
        candidate.segment.avg_logprob
        if candidate.segment.avg_logprob is not None
        else float("-inf")
    )
    midpoint = (candidate.segment.start + candidate.segment.end) / 2.0
    context_margin = min(
        midpoint - candidate.clip.start,
        candidate.clip.end - midpoint,
    )
    boundary_margin = min(
        candidate.segment.start - candidate.clip.start,
        candidate.clip.end - candidate.segment.end,
    )
    return (
        mean_word_score,
        average_log_probability,
        boundary_margin,
        context_margin,
    )


__all__ = [
    "RecoveryCandidate",
    "plan_recovery_clips",
    "select_recovery_segments",
]
