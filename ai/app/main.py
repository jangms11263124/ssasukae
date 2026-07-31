import traceback

from fastapi import FastAPI, HTTPException, UploadFile
from pydantic import BaseModel

from app.stt_service import transcribe_audio_bytes


class SttResponse(BaseModel):
    transcript: str


app = FastAPI()


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.post("/api/v1/stt", response_model=SttResponse)
async def transcribe_audio(audio: UploadFile):
    try:
        transcript = await transcribe_audio_bytes(
            await audio.read(),
            audio.filename,
        )
        return SttResponse(transcript=transcript)
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
