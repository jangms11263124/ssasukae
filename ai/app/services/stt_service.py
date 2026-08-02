import os

import httpx
from dotenv import load_dotenv


# scoring/ai/.env에 있는 GMS 또는 Whisper 설정을 환경 변수로 불러옵니다.
load_dotenv()

# GMS에서 제공하는 OpenAI 호환 Whisper transcription endpoint 기본값입니다.
DEFAULT_WHISPER_API_URL = (
    "https://gms.ssafy.io/gmsapi/api.openai.com/v1/audio/transcriptions"
)


async def transcribe_audio_bytes(
    audio_bytes: bytes,
    file_name: str | None = None,
) -> str:
    """오디오 바이트를 GMS Whisper API로 보내고 공백을 제거한 STT 결과를 반환합니다.

    API 키가 없거나 외부 API가 실패하거나 빈 텍스트를 반환하면 예외를 발생시켜 호출자가
    실패 원인을 HTTP 응답으로 변환할 수 있게 합니다.
    """
    # 프로젝트에서는 GMS_KEY를 기본으로 쓰고, WHISPER_API_KEY가 있으면 그 값을 사용합니다.
    api_key = os.getenv("WHISPER_API_KEY") or os.getenv("GMS_KEY")
    if not api_key:
        raise ValueError("WHISPER_API_KEY or GMS_KEY is not configured.")

    # 운영 환경에서 endpoint, 모델명, timeout을 바꿀 수 있도록 환경 변수로 열어둡니다.
    api_url = os.getenv("WHISPER_API_URL", DEFAULT_WHISPER_API_URL)
    model = os.getenv("WHISPER_API_MODEL", "whisper-1")
    timeout = float(os.getenv("WHISPER_API_TIMEOUT_SECONDS", "120"))

    # Whisper transcription API 규격에 맞춰 multipart/form-data로 오디오 파일을 전송합니다.
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            api_url,
            headers={"Authorization": f"Bearer {api_key}"},
            files={
                "file": (
                    file_name or "recording.webm",
                    audio_bytes,
                    "application/octet-stream",
                ),
            },
            data={
                "model": model,
                "language": "ko",
            },
        )

    # 외부 API 오류는 상태 코드와 응답 본문을 최대한 보존해서 디버깅하기 쉽게 만듭니다.
    if response.is_error:
        try:
            detail = response.json()
        except ValueError:
            detail = response.text
        raise RuntimeError(
            f"Whisper API request failed ({response.status_code}): {detail}"
        )

    # OpenAI 호환 transcription 응답의 text 필드가 실제 STT 결과입니다.
    transcript = response.json().get("text", "").strip()
    if not transcript:
        raise RuntimeError("Whisper API returned an empty transcript.")

    return transcript
