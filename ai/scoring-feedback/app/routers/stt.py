import traceback

from fastapi import APIRouter, HTTPException, UploadFile

from app.schemas.stt import SttResponse
from app.services.stt_service import transcribe_audio_bytes


router = APIRouter()


@router.post("/api/v1/stt", response_model=SttResponse)
async def transcribe_audio(audio: UploadFile):
    """업로드된 오디오를 읽어 STT 서비스에 전달하고 인식된 텍스트를 반환합니다.

    파일 읽기나 외부 STT 호출에 실패하면 원인을 포함한 HTTP 500 응답으로 변환합니다.
    """
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
