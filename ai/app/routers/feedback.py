from fastapi import APIRouter, HTTPException

from app.schemas.feedback import FeedbackRequest, FeedbackResponse
from app.services.feedback_service import create_feedback


router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackResponse)
def generate_feedback(request: FeedbackRequest):
    """검증된 점수와 음표 정보를 받아 AI 보컬 피드백 응답을 생성합니다.

    피드백 모델 호출이나 응답 변환이 실패하면 오류 내용을 HTTP 500으로 전달합니다.
    """
    try:
        return create_feedback(request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
