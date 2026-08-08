# 서버에서 발견한 오류 유형을 논문 검색용 영문 문장으로 변환합니다.
ISSUE_QUERY_MAP = {
    "pitch_flat": (
        "Research evidence and singing practice methods for correcting "
        "consistently flat pitch and improving vocal pitch-matching accuracy."
    ),
    "pitch_sharp": (
        "Research evidence and singing practice methods for correcting "
        "consistently sharp pitch and improving vocal pitch-matching accuracy."
    ),
    "unstable_pitch": (
        "Research evidence and singing practice methods for maintaining "
        "stable vocal pitch using auditory feedback, visual feedback, "
        "knowledge of results, and variable practice."
    ),
    "rhythm_early": (
        "Aural-skills exercises and singing practice methods for correcting "
        "early note onsets, feeling the meter, subdividing the beat, and "
        "maintaining a steady tempo."
    ),
    "rhythm_late": (
        "Aural-skills exercises and singing practice methods for correcting "
        "late note onsets, feeling the meter, subdividing the beat, and "
        "maintaining a steady tempo."
    ),
}


def build_rag_query(main_issues: list[dict]) -> str | None:
    """분석된 오류 목록을 중복 없는 RAG 검색 문장으로 변환합니다."""
    selected_queries = []
    selected_issue_types = set()

    for issue in main_issues:
        issue_type = issue.get("type")

        # 현재 문서로 지원하지 않는 오류 유형은 검색에서 제외합니다.
        if issue_type not in ISSUE_QUERY_MAP:
            continue

        # 같은 오류가 여러 음표에서 반복돼도 검색 문장은 한 번만 넣습니다.
        if issue_type in selected_issue_types:
            continue

        selected_issue_types.add(issue_type)
        selected_queries.append(ISSUE_QUERY_MAP[issue_type])

    if not selected_queries:
        return None

    return " ".join(selected_queries)
