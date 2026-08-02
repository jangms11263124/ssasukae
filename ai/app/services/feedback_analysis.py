from collections import Counter
from statistics import mean, pstdev

from app.schemas.feedback import NoteEvent


NOTE_TO_SEMITONE = {
    "C": 0,
    "C#": 1,
    "DB": 1,
    "D": 2,
    "D#": 3,
    "EB": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "GB": 6,
    "G": 7,
    "G#": 8,
    "AB": 8,
    "A": 9,
    "A#": 10,
    "BB": 10,
    "B": 11,
}

PITCH_TOLERANCE_SEMITONES = 0.7
TIMING_TOLERANCE_SECONDS = 0.18
LOW_COVERAGE_RATIO = 0.35
UNSTABLE_PITCH_STD = 0.75
MAX_ISSUES = 20


def note_name_to_midi(note_name: str) -> int | None:
    """C4·F#4 같은 음 이름을 MIDI 숫자로 변환하고, 형식이 잘못되면 None을 반환합니다."""
    normalized = note_name.strip().upper()
    if not normalized:
        return None

    if len(normalized) >= 2 and normalized[1] in {"#", "B"}:
        pitch_name = normalized[:2]
        octave_text = normalized[2:]
    else:
        pitch_name = normalized[:1]
        octave_text = normalized[1:]

    if pitch_name not in NOTE_TO_SEMITONE:
        return None

    try:
        octave = int(octave_text)
    except ValueError:
        return None

    return (octave + 1) * 12 + NOTE_TO_SEMITONE[pitch_name]


def midi_to_note_name(midi: float) -> str:
    """MIDI 숫자를 가장 가까운 반음으로 반올림해 C4·F#4 형식의 음 이름으로 변환합니다."""
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    rounded = round(midi)
    octave = (rounded // 12) - 1
    return f"{names[rounded % 12]}{octave}"


def _severity_from_pitch_error(error: float) -> str:
    """반음 단위 절대 음정 오차를 low·medium·high 심각도로 분류합니다."""
    if error >= 2:
        return "high"
    if error >= 1:
        return "medium"
    return "low"


def _severity_from_time_error(error: float) -> str:
    """초 단위 절대 시작 시간 오차를 low·medium·high 심각도로 분류합니다."""
    if error >= 0.45:
        return "high"
    if error >= 0.28:
        return "medium"
    return "low"


def _issue(
    reference_note: NoteEvent,
    issue_type: str,
    target: str,
    user: str | None,
    severity: str,
    detail: dict | None = None,
) -> dict:
    """정답 음표 구간과 오류 정보를 모델에 전달할 표준 오류 사전으로 구성합니다."""
    issue = {
        "start": round(reference_note.start, 3),
        "end": round(reference_note.start + reference_note.duration, 3),
        "type": issue_type,
        "target": target,
        "user": user,
        "severity": severity,
    }
    if detail:
        issue["detail"] = detail
    return issue


def _user_notes_in_reference_note(
    reference_note: NoteEvent,
    user_notes: list[NoteEvent],
) -> list[NoteEvent]:
    """정답 음표의 시작~종료 구간 안에서 시작된 사용자 음표만 골라 반환합니다."""
    reference_start = reference_note.start
    reference_end = reference_note.start + reference_note.duration
    return [
        note
        for note in user_notes
        if reference_start <= note.start <= reference_end
    ]


def _coverage(
    reference_note: NoteEvent,
    matched_user_notes: list[NoteEvent],
) -> float:
    """정답 음표 길이 대비 매칭된 사용자 음표 길이의 비율을 0~1로 계산합니다."""
    voiced_duration = sum(note.duration for note in matched_user_notes)
    return min(1, voiced_duration / max(reference_note.duration, 0.001))


def _analyze_reference_note(
    reference_note: NoteEvent,
    user_notes: list[NoteEvent],
) -> list[dict]:
    """정답 음표 하나를 사용자 음표들과 비교해 커버리지·음정·안정성·박자 오류를 찾습니다.

    한 정답 음표에서 여러 오류가 함께 발견될 수 있으며, 발견된 오류를 표준 사전 목록으로
    반환합니다.
    """
    issues: list[dict] = []
    matched_user_notes = _user_notes_in_reference_note(reference_note, user_notes)
    coverage = _coverage(reference_note, matched_user_notes)

    if coverage < LOW_COVERAGE_RATIO:
        issues.append(
            _issue(
                reference_note,
                "low_coverage",
                reference_note.note,
                None,
                "high" if coverage < 0.15 else "medium",
                {"coverage": round(coverage, 3), "matched_notes": len(matched_user_notes)},
            )
        )
        return issues

    target_midi = note_name_to_midi(reference_note.note)
    user_midi_values = [
        midi
        for midi in (note_name_to_midi(note.note) for note in matched_user_notes)
        if midi is not None
    ]
    if target_midi is None or not user_midi_values:
        return issues

    avg_midi = mean(user_midi_values)
    avg_error = avg_midi - target_midi
    pitch_std = pstdev(user_midi_values) if len(user_midi_values) > 1 else 0
    avg_user_note = midi_to_note_name(avg_midi)

    if abs(avg_error) > PITCH_TOLERANCE_SEMITONES:
        issues.append(
            _issue(
                reference_note,
                "pitch_sharp" if avg_error > 0 else "pitch_flat",
                reference_note.note,
                avg_user_note,
                _severity_from_pitch_error(abs(avg_error)),
                {
                    "average_pitch_error": round(avg_error, 3),
                    "coverage": round(coverage, 3),
                },
            )
        )

    if pitch_std > UNSTABLE_PITCH_STD:
        issues.append(
            _issue(
                reference_note,
                "unstable_pitch",
                reference_note.note,
                avg_user_note,
                "high" if pitch_std > 1.2 else "medium",
                {
                    "pitch_std": round(pitch_std, 3),
                    "coverage": round(coverage, 3),
                },
            )
        )

    first_user_note_start = matched_user_notes[0].start
    timing_error = first_user_note_start - reference_note.start
    if abs(timing_error) > TIMING_TOLERANCE_SECONDS:
        issues.append(
            _issue(
                reference_note,
                "rhythm_late" if timing_error > 0 else "rhythm_early",
                f"{reference_note.start:.2f}s",
                f"{first_user_note_start:.2f}s",
                _severity_from_time_error(abs(timing_error)),
                {"timing_error": round(timing_error, 3)},
            )
        )

    return issues


def analyze_issues(
    reference_notes: list[NoteEvent],
    user_notes: list[NoteEvent],
) -> list[dict]:
    """정답 음표를 순서대로 분석해 피드백에 사용할 주요 오류를 제한 개수만 반환합니다."""
    issues: list[dict] = []
    for reference_note in reference_notes:
        if len(issues) >= MAX_ISSUES:
            break
        issues.extend(_analyze_reference_note(reference_note, user_notes))
    return issues[:MAX_ISSUES]


def summarize_issues(issues: list[dict]) -> dict:
    """오류 목록을 유형별·심각도별 개수와 전체 개수로 집계합니다."""
    type_counts = Counter(issue["type"] for issue in issues)
    severity_counts = Counter(issue["severity"] for issue in issues)
    return {
        "total": len(issues),
        "by_type": dict(type_counts),
        "by_severity": dict(severity_counts),
    }
