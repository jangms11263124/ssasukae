import traceback

from fastapi import APIRouter, HTTPException, UploadFile

from app.schemas.stt import SttResponse
from app.services.stt_service import transcribe_audio_bytes


router = APIRouter()


@router.post("/api/v1/stt", response_model=SttResponse)
async def transcribe_audio(audio: UploadFile):
    # 업로드된 오디오 파일을 GMS Whisper API로 보내고 STT 결과만 반환합니다.
    try:
        transcript = await transcribe_audio_bytes(
            await audio.read(),
            audio.filename,
        )
        return SttResponse(transcript=transcript)
    except Exception as exc:
        # 외부 Whisper API 오류나 키 누락 같은 처리 실패를 500으로 전달합니다.
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
