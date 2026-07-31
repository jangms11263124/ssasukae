import re
from typing import Any


def _clamp(value: float, minimum: float, maximum: float) -> float:
    # 점수가 0~100 같은 정해진 범위를 벗어나지 않도록 제한합니다.
    return min(maximum, max(minimum, value))


def _number_field(item: dict[str, Any], names: tuple[str, ...]) -> float:
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


def _parse_midi_notes(payload: Any, label: str) -> list[dict[str, float]]:
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


def _median(values: list[float]) -> float:
    sorted_values = sorted(values)
    middle = len(sorted_values) // 2
    if len(sorted_values) % 2:
        return sorted_values[middle]
    return (sorted_values[middle - 1] + sorted_values[middle]) / 2


def calculate_final_score(
    reference_payload: Any,
    singer_payload: Any,
    lyrics_score: int,
    difficulty_score: float,
) -> int:
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
    # 난이도 점수는 프론트에서 0~100 범위로 계산해서 보내는 값입니다.
    if difficulty_score < 0 or difficulty_score > 100:
        raise ValueError("difficultyScore must be between 0 and 100.")

    reference_notes = _parse_midi_notes(reference_payload, "referenceMidi")
    singer_notes = _parse_midi_notes(singer_payload, "singerMidi")

    pitch_scores: list[float] = []
    rhythm_hits = 0
    stability_total = 0.0
    matched_note_count = 0

    for reference_note in reference_notes:
        # 가창자 MIDI는 정답 MIDI보다 훨씬 촘촘할 수 있습니다.
        # 그래서 1:1 순서 매칭이 아니라, 정답 음표 시간 구간과 겹치는
        # 모든 가창자 음표를 모아 하나의 비교 단위로 봅니다.
        overlapping_notes = [
            singer_note
            for singer_note in singer_notes
            if (
                singer_note["start_ms"] < reference_note["end_ms"]
                and singer_note["end_ms"] > reference_note["start_ms"]
            )
        ]

        if not overlapping_notes:
            pitch_scores.append(0)
            continue

        matched_note_count += 1

        # 음정 점수: 구간 안 피치의 대표값이 정답 MIDI와 가까울수록 높습니다.
        # 단순 평균보다 노이즈에 덜 흔들리도록 중앙값을 사용합니다.
        representative_midi = _median([note["midi"] for note in overlapping_notes])
        pitch_error = abs(reference_note["midi"] - representative_midi)
        pitch_scores.append(100 * (1 - _clamp(pitch_error / 3.0, 0, 1)))

        # 박자 점수: 정답 음표가 시작되는 시점 근처에 어떤 음이든 냈으면 통과입니다.
        # 음높이는 보지 않고, 시작 타이밍만 확인합니다.
        onset_tolerance_ms = 180
        reference_start_ms = reference_note["start_ms"]
        has_onset_near_reference = any(
            (
                abs(note["start_ms"] - reference_start_ms) <= onset_tolerance_ms
                or note["start_ms"] <= reference_start_ms <= note["end_ms"]
            )
            for note in overlapping_notes
        )
        if has_onset_near_reference:
            rhythm_hits += 1

        # 안정성 점수: 같은 정답 음표 구간 안에서 정답 음정 근처에 머문 비율을 봅니다.
        stability_total += (
            sum(
                1 if abs(note["midi"] - reference_note["midi"]) <= 0.6
                else 1 - _clamp((abs(note["midi"] - reference_note["midi"]) - 0.6) / 1.4, 0, 1)
                for note in overlapping_notes
            )
            / len(overlapping_notes)
        )

    # 정답 음표 중 실제로 가창자 MIDI가 겹친 구간의 비율입니다.
    coverage_score = matched_note_count / len(reference_notes)

    pitch_score = sum(pitch_scores) / len(reference_notes)
    rhythm_score = (rhythm_hits / len(reference_notes)) * 100
    stability_score = (stability_total / len(reference_notes)) * 100

    base_score = (
        pitch_score * 0.35
        + rhythm_score * 0.30
        + lyrics_score * 0.25
        + stability_score * 0.10
    ) * coverage_score

    final_score = base_score + (difficulty_score / 10)

    return {
        "finalScore": round(_clamp(final_score, 0, 100)),
        "pitchScore": round(_clamp(pitch_score, 0, 100)),
        "rhythmScore": round(_clamp(rhythm_score, 0, 100)),
        "stabilityScore": round(_clamp(stability_score, 0, 100)),
        "lyricsScore": round(_clamp(lyrics_score, 0, 100)),
    }
