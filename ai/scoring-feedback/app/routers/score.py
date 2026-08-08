import json
import asyncio
import traceback

from fastapi import APIRouter, Form, HTTPException, Response, UploadFile

from app.schemas.score import ScoreTestResponse
from app.services.feedback_service import build_feedback_request, create_feedback
from app.services.lyrics_service import score_lyrics
from app.services.score_service import calculate_score_details
from app.services.spring_service import SpringApiError, report_scoring_result


router = APIRouter()


async def _prepare_score(
    reference_midi: UploadFile,
    singer_midi: UploadFile,
    transcript: str,
    lyrics: str,
    difficulty_score: float,
):
    reference_payload = json.loads((await reference_midi.read()).decode("utf-8"))
    singer_payload = json.loads((await singer_midi.read()).decode("utf-8"))

    if not transcript.strip():
        raise ValueError("transcript must not be empty.")
    if not lyrics.strip():
        raise ValueError("lyrics must not be empty.")

    lyrics_score = score_lyrics(lyrics, transcript)["lyricsScore"]
    score_details = calculate_score_details(
        reference_payload,
        singer_payload,
        lyrics_score,
        difficulty_score,
    )
    feedback_request = build_feedback_request(
        score_details,
        reference_payload,
        singer_payload,
    )
    return score_details, feedback_request


@router.post("/api/v1/score/final/{performanceId}", status_code=200)
async def score_final_upload(
    performanceId: int,
    referenceMidi: UploadFile,
    singerMidi: UploadFile,
    transcript: str = Form(...),
    lyrics: str = Form(...),
    difficultyScore: float = Form(...),
    songId: int = Form(...),
    userId: int = Form(...),
):
    """가창 자료를 채점하고 AI 피드백을 생성한 뒤 Spring 서버에 결과를 전달합니다.

    정답·가창 MIDI JSON과 가사/STT 결과를 검증하여 세부 점수를 계산합니다. 입력 오류는
    HTTP 400, Spring 연동 오류는 HTTP 502, 그 밖의 처리 오류는 HTTP 500으로 반환합니다.
    """
    try:
        if min(performanceId, songId, userId) <= 0:
            raise ValueError("performanceId, songId, and userId must be positive.")
        score_details, feedback_request = await _prepare_score(
            referenceMidi,
            singerMidi,
            transcript,
            lyrics,
            difficultyScore,
        )
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        feedback = await asyncio.to_thread(create_feedback, feedback_request)

        await report_scoring_result(
            performanceId,
            {
                "songId": songId,
                "userId": userId,
                **score_details,
                "overall": feedback.summary,
                "strength": feedback.strengths,
                "weakness": feedback.improvements,
                "tips": feedback.practice_tips,
            },
        )
        return Response(status_code=200)
    except SpringApiError as exc:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/v1/score/test", response_model=ScoreTestResponse)
async def score_test_upload(
    referenceMidi: UploadFile,
    singerMidi: UploadFile,
    transcript: str = Form(...),
    lyrics: str = Form(...),
    difficultyScore: float = Form(...),
):
    """Spring callback 없이 최종 점수와 AI 피드백을 바로 반환합니다."""
    try:
        score_details, feedback_request = await _prepare_score(
            referenceMidi,
            singerMidi,
            transcript,
            lyrics,
            difficultyScore,
        )
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        feedback = await asyncio.to_thread(create_feedback, feedback_request)
        return ScoreTestResponse(
            **score_details,
            overall=feedback.summary,
            strength=feedback.strengths,
            weakness=feedback.improvements,
            tips=feedback.practice_tips,
        )
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
