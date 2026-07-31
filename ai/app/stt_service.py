import os

import httpx
from dotenv import load_dotenv


load_dotenv()

DEFAULT_WHISPER_API_URL = (
    "https://gms.ssafy.io/gmsapi/api.openai.com/v1/audio/transcriptions"
)


async def transcribe_audio_bytes(
    audio_bytes: bytes,
    file_name: str | None = None,
) -> str:
    """오디오 바이트를 GMS Whisper API로 보내 STT 텍스트를 반환합니다."""
    api_key = os.getenv("WHISPER_API_KEY") or os.getenv("GMS_KEY")
    if not api_key:
        raise ValueError("WHISPER_API_KEY or GMS_KEY is not configured.")

    api_url = os.getenv("WHISPER_API_URL", DEFAULT_WHISPER_API_URL)
    model = os.getenv("WHISPER_API_MODEL", "whisper-1")
    timeout = float(os.getenv("WHISPER_API_TIMEOUT_SECONDS", "120"))

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

    if response.is_error:
        try:
            detail = response.json()
        except ValueError:
            detail = response.text
        raise RuntimeError(
            f"Whisper API request failed ({response.status_code}): {detail}"
        )

    transcript = response.json().get("text", "").strip()
    if not transcript:
        raise RuntimeError("Whisper API returned an empty transcript.")

    return transcript
