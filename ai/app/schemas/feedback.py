from pydantic import BaseModel, Field


class NoteEvent(BaseModel):
    """피드백 분석에서 사용하는 초 단위 음표 구간과 음높이 정보입니다."""

    start: float = Field(..., description="Note start time in seconds")
    duration: float = Field(..., description="Note duration in seconds")
    note: str = Field(..., description="Pitch name, for example C4 or F#4")


class FeedbackRequest(BaseModel):
    """점수와 정답·사용자 음표를 전달받는 AI 피드백 요청 모델입니다."""

    overall_score: int = Field(..., ge=0, le=100)
    pitch_score: int = Field(..., ge=0, le=100)
    rhythm_score: int = Field(..., ge=0, le=100)
    stability_score: int = Field(..., ge=0, le=100)
    reference_notes: list[NoteEvent]
    user_notes: list[NoteEvent]


class FeedbackResponse(BaseModel):
    """AI가 생성한 요약·강점·개선점·연습법을 담는 피드백 응답 모델입니다."""

    summary: str
    strengths: str
    improvements: str
    practice_tips: str
