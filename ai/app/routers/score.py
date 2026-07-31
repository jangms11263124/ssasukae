import json
import traceback

from fastapi import APIRouter, Form, HTTPException, Response, UploadFile

from app.services.lyrics_service import score_lyrics
from app.services.score_service import calculate_final_score


router = APIRouter()


@router.post("/api/v1/score/final", status_code=200)
async def score_final_upload(
    referenceMidi: UploadFile,
    singerMidi: UploadFile,
    transcript: str = Form(...),
    lyrics: str = Form(...),
    difficultyScore: float = Form(...),
    songId: int = Form(...),
    userId: int = Form(...),
):
    try:
        reference_payload = json.loads((await referenceMidi.read()).decode("utf-8"))
        singer_payload = json.loads((await singerMidi.read()).decode("utf-8"))

        if not transcript.strip():
            raise ValueError("transcript must not be empty.")
        if not lyrics.strip():
            raise ValueError("lyrics must not be empty.")

        _ = (songId, userId)

        lyrics_score = score_lyrics(lyrics, transcript)["lyricsScore"]
        calculate_final_score(
            reference_payload,
            singer_payload,
            lyrics_score,
            difficultyScore,
        )
        return Response(status_code=200)
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
