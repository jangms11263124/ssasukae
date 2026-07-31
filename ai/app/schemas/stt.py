from pydantic import BaseModel


# STT만 수행하는 API의 응답 형식입니다.
class SttResponse(BaseModel):
    transcript: str
