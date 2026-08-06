import re
from statistics import pstdev
from typing import Any

from app.services.performance_rules import (
    MAX_PITCH_ERROR_SEMITONES,
    MAX_STABILITY_STD,
    LOW_COVERAGE_RATIO,
    PITCH_TOLERANCE_SEMITONES,
    STABILITY_STD_TOLERANCE,
    TIMING_TOLERANCE_SECONDS,
    coverage_ratio,
    exceeds_tolerance,
    intervals_overlap,
    onset_matches,
    score_with_tolerance,
)


FINAL_SCORE_BONUS = 10


def _clamp(value: float, minimum: float, maximum: float) -> float:
    """숫자가 지정한 최솟값과 최댓값 범위를 벗어나지 않도록 제한합니다."""
    # 점수가 0~100 같은 정해진 범위를 벗어나지 않도록 제한합니다.
    return min(maximum, max(minimum, value))


def _number_field(item: dict[str, Any], names: tuple[str, ...]) -> float:
    """여러 후보 필드 중 처음 발견한 숫자 값을 실수로 변환해 반환합니다.

    숫자 또는 숫자로 변환 가능한 문자열이 없으면 입력 형식 오류를 발생시킵니다.
    """
    # MIDI JSON을 만든 쪽에서 필드명을 조금 다르게 줄 수 있어 여러 후보명을 허용합니다.
    for name in names:
        value = item.get(name)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                pass
    raise ValueError(f"Missing numeric field: {'/'.join(names)}")


def _note_name_to_midi(note_name: str) -> float:
    """C4·F#4·Bb3 형식의 음 이름을 MIDI 음높이 숫자로 변환합니다."""
    normalized = note_name.strip().upper()
    match = re.fullmatch(r"([A-G])([#B]?)(-?\d+)", normalized)
    if not match:
        raise ValueError(f"Invalid note name: {note_name}")

    note, accidental, octave_text = match.groups()
    semitones = {
        "C": 0,
        "D": 2,
        "E": 4,
        "F": 5,
        "G": 7,
        "A": 9,
        "B": 11,
    }
    midi = (int(octave_text) + 1) * 12 + semitones[note]
    if accidental == "#":
        midi += 1
    elif accidental == "B":
        midi -= 1
    return float(midi)


def _midi_field(item: dict[str, Any]) -> float:
    """음표 객체에서 MIDI 숫자를 찾고, 없으면 음 이름을 MIDI 숫자로 변환합니다."""
    try:
        return _number_field(
            item,
            ("target_midi", "midi", "pitch_midi", "pitchMidi"),
        )
    except ValueError:
        note_name = item.get("note") or item.get("note_name") or item.get("noteName")
        if isinstance(note_name, str) and note_name.strip():
            return _note_name_to_midi(note_name)
        raise


def parse_midi_notes(payload: Any, label: str) -> list[dict[str, float]]:
    """서로 다른 필드명을 허용하는 MIDI JSON을 내부 표준 음표 목록으로 변환합니다.

    각 음표는 ``start_ms``, ``end_ms``, ``midi``를 가진 사전으로 정규화되며, 필수 값이
    없거나 종료 시간이 시작 시간보다 빠르면 입력 형식 오류를 발생시킵니다.
    """
    # 업로드된 MIDI JSON이 객체 형태인지 먼저 검증합니다.
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be a JSON object.")

    # 채점은 notes 배열을 기준으로 하므로 비어 있으면 계산할 수 없습니다.
    notes = payload.get("notes")
    if notes is None:
        notes = payload.get("user_notes")
    if not isinstance(notes, list) or not notes:
        raise ValueError(f"{label} must include a non-empty notes or user_notes array.")

    parsed: list[dict[str, float]] = []
    for index, raw_note in enumerate(notes):
        if not isinstance(raw_note, dict):
            raise ValueError(f"{label}.notes[{index}] must be an object.")

        # 프론트와 분석 파이프라인의 필드명 차이를 흡수하기 위해 camelCase도 함께 허용합니다.
        start_ms = _number_field(raw_note, ("start_ms", "startMs", "start"))
        try:
            end_ms = _number_field(raw_note, ("end_ms", "endMs", "end"))
        except ValueError:
            duration = _number_field(raw_note, ("duration_ms", "durationMs", "duration"))
            end_ms = start_ms + duration
        midi = _midi_field(raw_note)
        if end_ms <= start_ms:
            raise ValueError(f"{label}.notes[{index}] end time must be after start time.")

        # 이후 계산에서 필드명을 통일해서 쓰기 위해 표준 형태로 변환합니다.
        parsed.append(
            {
                "start_ms": start_ms,
                "end_ms": end_ms,
                "midi": midi,
            }
        )

    return parsed


def calculate_final_score(
    reference_payload: Any,
    singer_payload: Any,
    lyrics_score: int,
    difficulty_score: float,
) -> int:
    """세부 채점 함수를 실행하고 결과에서 최종 종합 점수만 반환합니다."""
    return calculate_score_details(
        reference_payload,
        singer_payload,
        lyrics_score,
        difficulty_score,
    )["finalScore"]


def calculate_score_details(
    reference_payload: Any,
    singer_payload: Any,
    lyrics_score: int,
    difficulty_score: float,
) -> dict[str, int]:
    """정답과 가창 MIDI를 비교해 음정·박자·안정성 및 최종 점수를 계산합니다.

    정답 음표와 시간 구간이 겹치는 가창 음표를 비교하고 가사 점수와 난이도 보정을
    합산합니다. 반환되는 모든 점수는 반올림한 0~100 정수입니다.
    """
    # 난이도 점수는 1~10 범위로 받아 최종 점수에 그대로 보정합니다.
    if difficulty_score < 1 or difficulty_score > 10:
        raise ValueError("difficultyScore must be between 1 and 10.")

    reference_notes = parse_midi_notes(reference_payload, "referenceMidi")
    singer_notes = parse_midi_notes(singer_payload, "singerMidi")

    # 정답 음표별 평균을 내지 않고, 실제로 비교된 모든 가창 음표의
    # 개별 점수를 한 목록에 누적합니다.
    pitch_scores: list[float] = []
    rhythm_hits = 0
    stability_total = 0.0
    has_pitch_issue = False
    has_rhythm_issue = False
    has_stability_issue = False

    for reference_note in reference_notes:
        # 가창자 MIDI는 정답 MIDI보다 훨씬 촘촘할 수 있습니다.
        # 그래서 1:1 순서 매칭이 아니라, 정답 음표 시간 구간과 겹치는
        # 모든 가창자 음표를 모아 하나의 비교 단위로 봅니다.
        overlapping_notes = [
            singer_note
            for singer_note in singer_notes
            if intervals_overlap(
                singer_note["start_ms"],
                singer_note["end_ms"],
                reference_note["start_ms"],
                reference_note["end_ms"],
            )
        ]

        if not overlapping_notes:
            has_rhythm_issue = True
            has_stability_issue = True
            continue

        # 음정 점수: 겹치는 가창 음표를 각각 채점해 전체 음정 점수 목록에
        # 바로 누적합니다. 정답 음표별 중간 평균은 계산하지 않습니다.
        for note in overlapping_notes:
            pitch_error = abs(reference_note["midi"] - note["midi"])
            if exceeds_tolerance(
                pitch_error,
                PITCH_TOLERANCE_SEMITONES,
            ):
                has_pitch_issue = True
            pitch_scores.append(
                score_with_tolerance(
                    pitch_error,
                    PITCH_TOLERANCE_SEMITONES,
                    MAX_PITCH_ERROR_SEMITONES,
                )
            )

        coverage = coverage_ratio(
            reference_note["start_ms"],
            reference_note["end_ms"],
            [
                (note["start_ms"], note["end_ms"])
                for note in overlapping_notes
            ],
        )
        if coverage < LOW_COVERAGE_RATIO:
            has_rhythm_issue = True
            has_stability_issue = True
            continue

        # 박자 점수: 정답 음표가 시작되는 시점 근처에 어떤 음이든 냈으면 통과입니다.
        # 음높이는 보지 않고, 시작 타이밍만 확인합니다.
        onset_tolerance_ms = TIMING_TOLERANCE_SECONDS * 1000
        reference_start_ms = reference_note["start_ms"]
        has_onset_near_reference = any(
            onset_matches(
                note["start_ms"],
                note["end_ms"],
                reference_start_ms,
                onset_tolerance_ms,
            )
            for note in overlapping_notes
        )
        if has_onset_near_reference:
            rhythm_hits += 1
        else:
            has_rhythm_issue = True

        # 안정성 점수: 피드백과 같게 구간 안 음높이의 표준편차를 사용합니다.
        midi_values = [note["midi"] for note in overlapping_notes]
        pitch_std = pstdev(midi_values) if len(midi_values) > 1 else 0.0
        if exceeds_tolerance(pitch_std, STABILITY_STD_TOLERANCE):
            has_stability_issue = True
        stability_total += (
            score_with_tolerance(
                pitch_std,
                STABILITY_STD_TOLERANCE,
                MAX_STABILITY_STD,
            )
            / 100
        )

    pitch_score = sum(pitch_scores) / len(pitch_scores) if pitch_scores else 0.0
    rhythm_score = (rhythm_hits / len(reference_notes)) * 100
    stability_score = (stability_total / len(reference_notes)) * 100

    base_score = (
        pitch_score * 0.35
        + rhythm_score * 0.30
        + lyrics_score * 0.25
        + stability_score * 0.10
    )

    # 기존 난이도 보정에 더해 전체 점수를 10점 상향합니다.
    final_score = base_score + difficulty_score + FINAL_SCORE_BONUS

    rounded_pitch_score = round(_clamp(pitch_score, 0, 100))
    rounded_rhythm_score = round(_clamp(rhythm_score, 0, 100))
    rounded_stability_score = round(_clamp(stability_score, 0, 100))

    if has_pitch_issue and rounded_pitch_score == 100:
        rounded_pitch_score = 99
    if has_rhythm_issue and rounded_rhythm_score == 100:
        rounded_rhythm_score = 99
    if has_stability_issue and rounded_stability_score == 100:
        rounded_stability_score = 99

    rounded_final_score = round(_clamp(final_score, 0, 100))
    if (
        rounded_final_score == 100
        and (has_pitch_issue or has_rhythm_issue or has_stability_issue)
    ):
        rounded_final_score = 99

    return {
        "finalScore": rounded_final_score,
        "pitchScore": rounded_pitch_score,
        "rhythmScore": rounded_rhythm_score,
        "stabilityScore": rounded_stability_score,
        "lyricsScore": round(_clamp(lyrics_score, 0, 100)),
    }
