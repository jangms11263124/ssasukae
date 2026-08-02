from pydantic import BaseModel


# STT만 수행하는 API의 응답 형식입니다.
class SttResponse(BaseModel):
    """음성 인식 API가 반환하는 최종 텍스트 응답 모델입니다."""

    transcript: str
