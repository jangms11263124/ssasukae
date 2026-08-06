"""채점과 피드백 분석이 공통으로 사용하는 허용 기준입니다."""


PITCH_TOLERANCE_SEMITONES = 0.9
TIMING_TOLERANCE_SECONDS = 0.18
STABILITY_STD_TOLERANCE = 1.2

MAX_PITCH_ERROR_SEMITONES = 3.0
MAX_STABILITY_STD = 2.5
HIGH_STABILITY_STD = 1.7
LOW_COVERAGE_RATIO = 0.35
FLOAT_COMPARISON_EPSILON = 1e-9


def intervals_overlap(
    first_start: float,
    first_end: float,
    second_start: float,
    second_end: float,
) -> bool:
    """두 시간 구간이 실제로 겹치는지 확인합니다."""
    return first_start < second_end and first_end > second_start


def coverage_ratio(
    reference_start: float,
    reference_end: float,
    note_intervals: list[tuple[float, float]],
) -> float:
    """기준 구간 중 사용자 음표가 겹친 길이의 비율을 계산합니다."""
    reference_duration = max(reference_end - reference_start, 0.001)
    covered_duration = sum(
        max(
            0.0,
            min(reference_end, note_end)
            - max(reference_start, note_start),
        )
        for note_start, note_end in note_intervals
    )
    return min(1.0, covered_duration / reference_duration)


def onset_matches(
    note_start: float,
    note_end: float,
    reference_start: float,
    tolerance: float,
) -> bool:
    """음 시작이 허용 범위 안이거나 기준 시점을 포함하는지 확인합니다."""
    return (
        abs(note_start - reference_start)
        <= tolerance + FLOAT_COMPARISON_EPSILON
        or note_start <= reference_start <= note_end
    )


def exceeds_tolerance(error: float, tolerance: float) -> bool:
    """부동소수점 오차를 감안해 허용 범위 초과 여부를 판단합니다."""
    return error > tolerance + FLOAT_COMPARISON_EPSILON


def score_with_tolerance(
    error: float,
    tolerance: float,
    maximum_error: float,
) -> float:
    """허용 범위 안은 100점, 최대 오차 이상은 0점으로 환산합니다."""
    if not exceeds_tolerance(error, tolerance):
        return 100.0
    if error >= maximum_error:
        return 0.0

    error_range = maximum_error - tolerance
    return 100.0 * (1 - ((error - tolerance) / error_range))
