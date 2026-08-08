"""Conservative recovery of line-initial CTC timings for sung lyrics.

CTC aligners often emit a character near the end of a long sung syllable.
For confident repeated lyrics this module moves a prefix only when two
independent signals agree:

* a quiet-to-active transition exists in the separated-vocal RMS profile; and
* four reliable suffix onsets in another occurrence share one time offset.

An explicitly low-confidence or very-short first unit may use the separated
vocal onset alone, while still respecting every preceding timed lyric unit.

The recovery runs before held-note extension so corrected onsets remain hard
caps for the preceding syllables.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass
import math
from statistics import median
from typing import TYPE_CHECKING, Any

from .text import normalize_text

if TYPE_CHECKING:
    from .activity import EnergyProfile


@dataclass(frozen=True, slots=True)
class OnsetRescueConfig:
    """Safety limits for recovering a line prefix."""

    maximum_backtrack_seconds: float = 3.0
    minimum_shift_seconds: float = 0.18
    repeat_transfer_minimum_shift_seconds: float = 0.8
    minimum_quiet_ms: int = 150
    minimum_active_ms: int = 100
    bridge_silence_ms: int = 100
    weak_onset_backtrack_ms: int = 180
    active_tail_tolerance_ms: int = 120
    low_threshold_ratio: float = 0.70
    suffix_units: int = 4
    suffix_tolerance_seconds: float = 0.08
    suffix_minimum_inlier_ratio: float = 0.70
    repeat_energy_tolerance_seconds: float = 0.30
    minimum_repeat_units: int = 6
    minimum_repeat_characters: int = 6
    minimum_unit_seconds: float = 0.02
    reliable_confidence: float = 0.70

    def __post_init__(self) -> None:
        positive_numbers = (
            self.maximum_backtrack_seconds,
            self.minimum_shift_seconds,
            self.repeat_transfer_minimum_shift_seconds,
            self.minimum_quiet_ms,
            self.minimum_active_ms,
            self.bridge_silence_ms,
            self.weak_onset_backtrack_ms,
            self.active_tail_tolerance_ms,
            self.suffix_units,
            self.suffix_tolerance_seconds,
            self.repeat_energy_tolerance_seconds,
            self.minimum_repeat_units,
            self.minimum_repeat_characters,
            self.minimum_unit_seconds,
        )
        if any(value <= 0 for value in positive_numbers):
            raise ValueError("onset rescue limits must be positive")
        if not 0.0 < self.low_threshold_ratio <= 1.0:
            raise ValueError("low_threshold_ratio must be in (0, 1]")
        if not 0.0 < self.suffix_minimum_inlier_ratio <= 1.0:
            raise ValueError("suffix_minimum_inlier_ratio must be in (0, 1]")
        if not 0.0 <= self.reliable_confidence <= 1.0:
            raise ValueError("reliable_confidence must be between 0 and 1")


@dataclass(frozen=True, slots=True)
class _Profile:
    values: tuple[float, ...]
    duration: float
    hop: float
    offset: float
    threshold: float


def _profile(value: "EnergyProfile | None") -> _Profile | None:
    if value is None:
        return None
    try:
        values = tuple(float(item) for item in value.rms)
        duration = float(value.duration)
        hop = float(value.hop_seconds)
        offset = float(value.time_offset_seconds)
        threshold = float(value.global_threshold)
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError("energy_profile has invalid onset fields") from exc
    if (
        not values
        or duration <= 0
        or hop <= 0
        or offset < 0
        or threshold <= 0
        or any(not math.isfinite(item) or item < 0 for item in values)
        or any(
            not math.isfinite(item)
            for item in (duration, hop, offset, threshold)
        )
    ):
        return None
    return _Profile(values, duration, hop, offset, threshold)


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number >= 0 else None


def _units(line: Mapping[str, Any]) -> list[dict[str, Any]]:
    value = line.get("syllables", line.get("units", []))
    if not isinstance(value, list):
        return []
    return [unit for unit in value if isinstance(unit, dict)]


def _flags(value: Mapping[str, Any]) -> list[str]:
    raw = value.get("flags", [])
    if not isinstance(raw, Sequence) or isinstance(raw, (str, bytes)):
        return []
    return [str(flag) for flag in raw]


def _add_flags(value: dict[str, Any], *flags: str) -> None:
    current = _flags(value)
    for flag in flags:
        if flag not in current:
            current.append(flag)
    value["flags"] = current


def _remove_obsolete_short_flag(value: dict[str, Any]) -> None:
    start = _number(value.get("start"))
    end = _number(value.get("end"))
    if start is None or end is None or end - start < 0.04:
        return
    value["flags"] = [flag for flag in _flags(value) if flag != "very_short"]


def _bridge_short_false_runs(values: list[bool], maximum: int) -> None:
    index = 0
    while index < len(values):
        if values[index]:
            index += 1
            continue
        end = index
        while end < len(values) and not values[end]:
            end += 1
        if index > 0 and end < len(values) and end - index <= maximum:
            values[index:end] = [True] * (end - index)
        index = end


def _remove_short_true_runs(values: list[bool], minimum: int) -> None:
    index = 0
    while index < len(values):
        if not values[index]:
            index += 1
            continue
        end = index
        while end < len(values) and values[end]:
            end += 1
        if end - index < minimum:
            values[index:end] = [False] * (end - index)
        index = end


def _energy_onset(
    profile: _Profile,
    raw_start: float,
    *,
    lower_bound: float,
    config: OnsetRescueConfig,
) -> float | None:
    """Find the latest separated quiet-to-active attack before ``raw_start``."""

    search_start = max(lower_bound, raw_start - config.maximum_backtrack_seconds)
    search_end = min(
        profile.duration,
        raw_start + config.active_tail_tolerance_ms / 1000.0,
    )
    if search_end <= search_start:
        return None

    def index_at(timestamp: float) -> int:
        relative = (timestamp - profile.offset) / profile.hop
        return min(len(profile.values), max(0, math.ceil(relative - 1e-9)))

    first_index = index_at(search_start)
    final_index = index_at(search_end)
    if final_index - first_index < 3:
        return None

    active = [
        value >= profile.threshold
        for value in profile.values[first_index:final_index]
    ]
    bridge_frames = max(
        0, math.floor((config.bridge_silence_ms / 1000.0) / profile.hop)
    )
    active_frames = max(
        1, math.ceil((config.minimum_active_ms / 1000.0) / profile.hop)
    )
    quiet_frames = max(
        1, math.ceil((config.minimum_quiet_ms / 1000.0) / profile.hop)
    )
    _bridge_short_false_runs(active, bridge_frames)
    _remove_short_true_runs(active, active_frames)

    runs: list[tuple[int, int]] = []
    index = 0
    while index < len(active):
        if not active[index]:
            index += 1
            continue
        end = index
        while end < len(active) and active[end]:
            end += 1
        runs.append((index, end))
        index = end

    raw_local = (raw_start - search_start) / profile.hop
    tail_frames = (config.active_tail_tolerance_ms / 1000.0) / profile.hop
    eligible: list[tuple[int, int]] = []
    for start, end in runs:
        if start > raw_local + 1:
            continue
        if end < raw_local - tail_frames:
            continue
        quiet_start = max(0, start - quiet_frames)
        if start - quiet_start < quiet_frames or any(active[quiet_start:start]):
            continue
        eligible.append((start, end))
    if not eligible:
        return None

    active_start = eligible[-1][0] + first_index
    low_threshold = profile.threshold * config.low_threshold_ratio
    backtrack_frames = max(
        0,
        math.ceil((config.weak_onset_backtrack_ms / 1000.0) / profile.hop),
    )
    lower_index = max(first_index, active_start - backtrack_frames)
    candidate_index = active_start
    while (
        candidate_index > lower_index
        and profile.values[candidate_index - 1] >= low_threshold
    ):
        candidate_index -= 1

    candidate = profile.offset + candidate_index * profile.hop
    candidate = max(search_start, lower_bound, candidate)
    if raw_start - candidate < config.minimum_shift_seconds:
        return None
    return round(candidate, 3)


def _line_key(line: Mapping[str, Any], config: OnsetRescueConfig) -> str:
    text = line.get("text")
    if not isinstance(text, str):
        return ""
    normalized = normalize_text(text)
    if len(normalized) < config.minimum_repeat_characters:
        return ""
    if len(_units(line)) < config.minimum_repeat_units:
        return ""
    return normalized


def _reliable(unit: Mapping[str, Any], threshold: float) -> bool:
    confidence = _number(unit.get("confidence"))
    if confidence is None or confidence < threshold:
        return False
    forbidden = {
        "unmatched",
        "out_of_order",
        "very_short",
        "overlap_adjusted",
        "timing_adjusted",
        "onset_rescued",
        "repeat_timing_rescued",
    }
    return forbidden.isdisjoint(_flags(unit))


def _stable_suffix(
    target: Sequence[Mapping[str, Any]],
    donor: Sequence[Mapping[str, Any]],
    config: OnsetRescueConfig,
) -> tuple[int, float, float] | None:
    count = min(len(target), len(donor))
    final_seam = count - config.suffix_units
    for seam in range(2, final_seam + 1):
        window_indices = range(seam, seam + config.suffix_units)
        if not all(
            _reliable(target[index], config.reliable_confidence)
            and _reliable(donor[index], config.reliable_confidence)
            for index in window_indices
        ):
            continue
        target_starts = [
            _number(target[index].get("start")) for index in window_indices
        ]
        donor_starts = [
            _number(donor[index].get("start")) for index in window_indices
        ]
        if any(value is None for value in (*target_starts, *donor_starts)):
            continue
        window_deltas = [
            float(target_start) - float(donor_start)
            for target_start, donor_start in zip(target_starts, donor_starts)
        ]
        spread = max(window_deltas) - min(window_deltas)
        if spread > config.suffix_tolerance_seconds:
            continue
        if float(target_starts[-1]) - float(target_starts[0]) < 0.60:
            continue

        offset = float(median(window_deltas))
        tail_deltas: list[float] = []
        for index in range(seam, count):
            if not (
                _reliable(target[index], config.reliable_confidence)
                and _reliable(donor[index], config.reliable_confidence)
            ):
                continue
            target_start = _number(target[index].get("start"))
            donor_start = _number(donor[index].get("start"))
            if target_start is None or donor_start is None:
                continue
            tail_deltas.append(target_start - donor_start)
        if len(tail_deltas) < config.suffix_units:
            continue
        inliers = sum(
            abs(delta - offset) <= config.suffix_tolerance_seconds
            for delta in tail_deltas
        )
        if inliers / len(tail_deltas) < config.suffix_minimum_inlier_ratio:
            continue
        return seam, offset, spread
    return None


def _repeat_proposal(
    target: Sequence[Mapping[str, Any]],
    donor: Sequence[Mapping[str, Any]],
    *,
    seam: int,
    offset: float,
    recovered_start: float,
    config: OnsetRescueConfig,
) -> list[tuple[float, float]] | None:
    proposal: list[tuple[float, float]] = []
    for index in range(seam):
        donor_start = _number(donor[index].get("start"))
        donor_end = _number(donor[index].get("end"))
        if donor_start is None or donor_end is None:
            return None
        start = recovered_start if index == 0 else donor_start + offset
        end = donor_end + offset
        # WhisperX timestamps are decimal frame positions.  A nominal 20 ms
        # unit such as 66.116 -> 66.136 can be represented just below 0.02 by
        # binary floats, so keep an epsilon at this inclusive boundary.
        if end - start + 1e-9 < config.minimum_unit_seconds:
            return None
        proposal.append((start, end))

    seam_start = _number(target[seam].get("start"))
    if seam_start is None:
        return None
    for index, (start, end) in enumerate(proposal):
        next_start = proposal[index + 1][0] if index + 1 < seam else seam_start
        if start >= next_start:
            return None
        if end > next_start:
            if end - next_start > config.suffix_tolerance_seconds:
                return None
            proposal[index] = (start, next_start)

    rounded = [(round(start, 3), round(end, 3)) for start, end in proposal]
    for index, (start, end) in enumerate(rounded):
        next_start = (
            rounded[index + 1][0]
            if index + 1 < seam
            else round(seam_start, 3)
        )
        if start >= next_start or end > next_start:
            return None
        if end - start + 1e-9 < config.minimum_unit_seconds:
            return None
    return rounded


def _previous_timed_end(lines: Sequence[Any], line_index: int) -> float:
    """Return the latest valid end before a line, including partial lines."""

    latest = 0.0
    for line in lines[:line_index]:
        if not isinstance(line, Mapping):
            continue
        line_end = _number(line.get("end"))
        if line_end is not None:
            latest = max(latest, line_end)
        for unit in _units(line):
            unit_end = _number(unit.get("end"))
            if unit_end is not None:
                latest = max(latest, unit_end)
    return latest


def _commit_energy_start(line: dict[str, Any], decision: Mapping[str, Any]) -> None:
    units = _units(line)
    if not units:
        return
    first = units[0]
    raw_start = _number(first.get("start"))
    if raw_start is not None:
        first.setdefault("alignment_start", raw_start)
    first["start"] = decision["recovered_start"]
    _add_flags(first, "onset_rescued", "timing_adjusted")
    _remove_obsolete_short_flag(first)
    line["start"] = decision["recovered_start"]
    _add_flags(line, "onset_rescued", "timing_adjusted")


def rescue_document_onsets(
    document: Mapping[str, Any],
    *,
    energy_profile: "EnergyProfile | None" = None,
    config: OnsetRescueConfig | None = None,
) -> dict[str, Any]:
    """Return a copy with confidence-gated line-prefix onset corrections."""

    config = config or OnsetRescueConfig()
    normalized_profile = _profile(energy_profile)
    payload = deepcopy(dict(document))
    raw_lines = payload.get("lines", [])
    if not isinstance(raw_lines, list):
        raise TypeError("document lines must be a list")
    existing_metadata = payload.get("metadata")
    if isinstance(existing_metadata, Mapping):
        existing_rescue = existing_metadata.get("onset_rescue")
        if isinstance(existing_rescue, Mapping) and existing_rescue.get("version") == 1:
            return payload
    if normalized_profile is None:
        return payload

    groups: dict[str, list[int]] = defaultdict(list)
    for line_index, line in enumerate(raw_lines):
        if not isinstance(line, Mapping):
            continue
        key = _line_key(line, config)
        if key:
            groups[key].append(line_index)

    energy_decisions: dict[int, dict[str, Any]] = {}
    consensus_required: set[int] = set()
    for line_index, line in enumerate(raw_lines):
        if not isinstance(line, dict):
            continue
        line_units = _units(line)
        if not line_units:
            continue
        first = line_units[0]
        if "onset_rescued" in _flags(first):
            continue
        raw_start = _number(first.get("start"))
        raw_end = _number(first.get("end"))
        if raw_start is None or raw_end is None:
            continue
        key = _line_key(line, config)
        repeated = bool(key and len(groups[key]) > 1)
        confidence = _number(first.get("confidence")) or 0.0
        first_flags = set(_flags(first))
        weak_first = (
            confidence <= 0.5
            or "low_confidence" in first_flags
            or "very_short" in first_flags
        )
        if not repeated and not weak_first:
            continue

        lower_bound = _previous_timed_end(raw_lines, line_index)
        candidate = _energy_onset(
            normalized_profile,
            raw_start,
            lower_bound=lower_bound,
            config=config,
        )
        if candidate is None or candidate >= raw_end:
            continue

        energy_decisions[line_index] = {
            "line_index": line_index,
            "alignment_start": raw_start,
            "recovered_start": candidate,
            "shift_seconds": round(raw_start - candidate, 3),
            "method": "quiet_to_active_rms",
        }
        if repeated and not weak_first:
            consensus_required.add(line_index)

    # Freeze the raw state so one accepted repeat cannot become a donor for a
    # later line and cause cascading timing drift.
    snapshot = deepcopy(raw_lines)
    accepted_decisions: dict[int, dict[str, Any]] = {}
    repeat_count = 0
    for target_index, decision in energy_decisions.items():
        target_line = snapshot[target_index]
        if not isinstance(target_line, Mapping):
            continue
        key = _line_key(target_line, config)
        candidate_indices = [index for index in groups.get(key, []) if index != target_index]
        target_units = _units(target_line)
        needs_transfer = (
            decision["shift_seconds"]
            >= config.repeat_transfer_minimum_shift_seconds
        )
        best: tuple[
            tuple[float, float, int],
            int,
            int,
            float,
            list[tuple[float, float]] | None,
        ] | None = None
        for donor_index in candidate_indices:
            donor_line = snapshot[donor_index]
            if not isinstance(donor_line, Mapping):
                continue
            donor_units = _units(donor_line)
            if len(donor_units) != len(target_units):
                continue
            if [str(unit.get("text", "")) for unit in donor_units] != [
                str(unit.get("text", "")) for unit in target_units
            ]:
                continue
            suffix = _stable_suffix(target_units, donor_units, config)
            if suffix is None:
                continue
            seam, offset, spread = suffix
            donor_decision = energy_decisions.get(donor_index)
            if donor_decision is not None:
                donor_start = float(donor_decision["recovered_start"])
            else:
                if not _reliable(
                    donor_units[0], config.reliable_confidence
                ):
                    continue
                donor_start = _number(donor_units[0].get("start"))
            if donor_start is None:
                continue
            predicted_start = donor_start + offset
            energy_mismatch = abs(predicted_start - decision["recovered_start"])
            if energy_mismatch > config.repeat_energy_tolerance_seconds:
                continue
            if decision["alignment_start"] - predicted_start < config.minimum_shift_seconds:
                continue
            proposal: list[tuple[float, float]] | None = None
            if needs_transfer:
                proposal = _repeat_proposal(
                    target_units,
                    donor_units,
                    seam=seam,
                    offset=offset,
                    recovered_start=decision["recovered_start"],
                    config=config,
                )
                if proposal is None:
                    continue
            rank = (energy_mismatch, spread, seam)
            candidate = (rank, donor_index, seam, offset, proposal)
            if best is None or candidate[0] < best[0]:
                best = candidate

        output_line = raw_lines[target_index]
        if not isinstance(output_line, dict):
            continue
        if best is None:
            if target_index in consensus_required:
                # A confident repeated line needs the independent suffix
                # timing signal; RMS alone is not enough to move it.
                continue
            _commit_energy_start(output_line, decision)
            accepted_decisions[target_index] = decision
            continue

        _, donor_index, seam, offset, proposal = best
        if proposal is None:
            _commit_energy_start(output_line, decision)
            decision.update(
                method="quiet_to_active_rms+repeat_suffix_confirmation",
                template_line_index=donor_index,
                seam_unit_index=seam,
                suffix_offset_seconds=round(offset, 3),
                suffix_spread_seconds=round(best[0][1], 3),
            )
        else:
            output_units = _units(output_line)
            for unit_index, (start, end) in enumerate(proposal):
                unit = output_units[unit_index]
                old_start = _number(unit.get("alignment_start"))
                if old_start is None:
                    old_start = _number(unit.get("start"))
                if old_start is not None:
                    unit.setdefault("alignment_start", old_start)
                unit["start"] = start
                unit["end"] = end
                _add_flags(
                    unit,
                    "onset_rescued",
                    "repeat_timing_rescued",
                    "timing_adjusted",
                )
                _remove_obsolete_short_flag(unit)
            output_line["start"] = proposal[0][0]
            _add_flags(
                output_line,
                "onset_rescued",
                "repeat_timing_rescued",
                "timing_adjusted",
            )
            decision.update(
                method="quiet_to_active_rms+repeat_suffix_consensus",
                template_line_index=donor_index,
                seam_unit_index=seam,
                suffix_offset_seconds=round(offset, 3),
                suffix_spread_seconds=round(best[0][1], 3),
            )
            repeat_count += 1
        accepted_decisions[target_index] = decision

    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
        payload["metadata"] = metadata
    metadata["onset_rescue"] = {
        "version": 1,
        "method": "quiet_to_active_rms+repeat_suffix_consensus",
        "applied_count": len(accepted_decisions),
        "repeat_transfer_count": repeat_count,
        "maximum_backtrack_seconds": config.maximum_backtrack_seconds,
        "minimum_quiet_ms": config.minimum_quiet_ms,
        "minimum_active_ms": config.minimum_active_ms,
        "corrections": [
            accepted_decisions[index] for index in sorted(accepted_decisions)
        ],
    }
    return payload


__all__ = ["OnsetRescueConfig", "rescue_document_onsets"]
