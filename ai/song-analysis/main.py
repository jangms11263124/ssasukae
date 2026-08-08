from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import traceback
import uuid
from datetime import datetime
from pathlib import Path
from time import perf_counter
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
import httpx
import jwt
from dotenv import load_dotenv
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

STORAGE_DIR = BASE_DIR / "storage" / "jobs"
MODEL_DIR = BASE_DIR / "storage" / "models"
SYLLABLE_MODEL_DIR = Path(
    os.getenv(
        "SYLLABLE_MODEL_DIR",
        str(BASE_DIR / "storage" / "alignment-models" / "whisper"),
    )
).resolve()
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_TEXT_EXTENSIONS = {".txt", ".lrc", ".json"}
DEFAULT_CORS_ALLOW_ORIGINS = (
    "https://ssafystar-k.site",
    "http://localhost:3000",
)
CORS_ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOW_ORIGINS",
        ",".join(DEFAULT_CORS_ALLOW_ORIGINS),
    ).split(",")
    if origin.strip()
]

MAX_AUDIO_SIZE = 200 * 1024 * 1024
MAX_IMAGE_SIZE = 20 * 1024 * 1024
MAX_TEXT_SIZE = 5 * 1024 * 1024
TICKET_PURPOSE = "SONG_AI_UPLOAD"
UPLOAD_TICKET_SECRET = os.getenv("AI_UPLOAD_TICKET_SECRET")
BACKEND_CALLBACK_URL = os.getenv("BACKEND_ANALYSIS_RESULT_URL")
INTERNAL_API_KEY = os.getenv("AI_INTERNAL_API_KEY")
BACKEND_CALLBACK_TIMEOUT_SECONDS = max(
    1.0,
    float(os.getenv("BACKEND_CALLBACK_TIMEOUT_SECONDS", "120")),
)
BACKEND_CALLBACK_MP3_BITRATE = os.getenv(
    "BACKEND_CALLBACK_MP3_BITRATE",
    "192k",
).strip() or "192k"
LOCAL_RESULT_DIR = (
    Path(os.environ["LOCAL_RESULT_DIR"]).resolve()
    if os.getenv("LOCAL_RESULT_DIR")
    else None
)
PRESERVE_FAILED_JOBS = os.getenv("PRESERVE_FAILED_JOBS", "1").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOGGER = logging.getLogger("vocal-analysis")

app = FastAPI(title="Vocal Analysis API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class AnalysisAcceptedResponse(BaseModel):
    jobId: str
    status: Literal["accepted"] = "accepted"


@app.get("/ping")
def ping():
    return {"status": "ok"}


def append_log(job_dir: Path, message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    LOGGER.info("[%s] %s", job_dir.name, message)
    with (job_dir / "processing.log").open("a", encoding="utf-8") as log:
        log.write(f"[{timestamp}] {message}\n")


def encode_mr_mp3(source_path: Path, output_path: Path) -> Path:
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        try:
            import imageio_ffmpeg
        except ImportError as exc:
            raise RuntimeError("ffmpeg is required to encode the callback MR as MP3.") from exc
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()

    completed = subprocess.run(
        [
            ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source_path),
            "-vn",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            BACKEND_CALLBACK_MP3_BITRATE,
            str(output_path),
        ],
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or "unknown ffmpeg error"
        raise RuntimeError(f"MR MP3 encoding failed: {detail}")
    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RuntimeError("MR MP3 encoding did not create an output file.")
    return output_path


async def save_upload(file: UploadFile, output_path: Path, max_size: int) -> None:
    size = 0
    with output_path.open("wb") as output:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > max_size:
                limit_mb = max_size // 1024 // 1024
                raise HTTPException(413, f"File size limit is {limit_mb}MB.")
            output.write(chunk)


def preserve_local_results(
    job_id: str,
    job_dir: Path,
    metadata: dict,
    filename_prefix: str,
) -> Path | None:
    if LOCAL_RESULT_DIR is None:
        return None

    output_dir = LOCAL_RESULT_DIR / job_id
    output_dir.mkdir(parents=True, exist_ok=False)
    for source_name, output_name in (
        ("original.mp3", f"{filename_prefix}_original.mp3"),
        ("instrumental.wav", f"{filename_prefix}_mr.wav"),
        ("instrumental.mp3", f"{filename_prefix}_mr.mp3"),
        ("reference.json", f"{filename_prefix}_midi.json"),
        ("lead_vocal.wav", f"{filename_prefix}_vocal.wav"),
        ("processing.log", f"{filename_prefix}_processing.log"),
    ):
        source_path = job_dir / source_name
        if source_path.exists():
            shutil.copy2(source_path, output_dir / output_name)
    (output_dir / f"{filename_prefix}_result.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return output_dir


def build_result_filename_prefix(artist: str, title: str) -> str:
    def clean(value: str) -> str:
        value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value.strip())
        value = re.sub(r"\s+", "_", value)
        value = re.sub(r"_+", "_", value).strip(" ._")
        return value[:80] or "unknown"

    return f"{clean(artist)}_{clean(title)}"


def calculate_difficulty(reference: dict) -> int:
    notes = reference.get("notes", [])
    duration_min = max(float(reference.get("duration_ms", 0)) / 60000.0, 0.1)
    if not notes:
        return 1

    pitches = [float(note["pitch_midi"]) for note in notes if "pitch_midi" in note]
    durations = [float(note["duration_ms"]) for note in notes if "duration_ms" in note]
    pitch_range = max(pitches) - min(pitches) if pitches else 0.0
    notes_per_minute = len(notes) / duration_min
    short_note_ratio = (
        sum(1 for duration in durations if duration <= 180) / len(durations)
        if durations
        else 0.0
    )

    score = 1.0
    score += min(3.0, pitch_range / 8.0)
    score += min(3.0, notes_per_minute / 45.0)
    score += min(2.0, short_note_ratio * 2.0)
    return max(1, min(10, round(score)))


def verify_upload_ticket(ticket: str) -> dict:
    if not UPLOAD_TICKET_SECRET:
        raise HTTPException(500, "AI_UPLOAD_TICKET_SECRET is not configured.")
    try:
        claims = jwt.decode(
            ticket,
            UPLOAD_TICKET_SECRET,
            algorithms=["HS256"],
            options={"require": ["sub", "purpose", "iat", "exp"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(401, "Upload ticket has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(401, "Invalid upload ticket.") from exc
    if not isinstance(claims.get("sub"), str) or not claims["sub"]:
        raise HTTPException(401, "Invalid upload ticket subject.")
    if claims.get("purpose") != TICKET_PURPOSE:
        raise HTTPException(403, "Invalid upload ticket purpose.")
    return claims


def analyze_song(job_dir: Path, original_path: Path, hop_ms: int) -> dict:
    # Keep the heavy ML stack optional when running the callback-only test page.
    from services.reference_builder import AnalysisConfig, build_reference
    from services.vocal_separator import SeparationConfig, separate_lead_vocal

    started_at = perf_counter()
    try:
        append_log(job_dir, f"Analysis started: {original_path.name}")
        outputs = separate_lead_vocal(
            original_path,
            job_dir,
            SeparationConfig(model_dir=MODEL_DIR),
            logger=lambda message: append_log(job_dir, message),
        )
        append_log(job_dir, "Vocal separation completed")

        append_log(job_dir, "Reference analysis started")
        reference_path = build_reference(
            outputs["lead_vocal"],
            job_dir,
            AnalysisConfig(hop_ms=hop_ms),
        )
        append_log(job_dir, "Reference analysis completed")
        reference = json.loads(reference_path.read_text(encoding="utf-8"))
        difficulty = calculate_difficulty(reference)
        elapsed_seconds = round(perf_counter() - started_at, 3)

        job_data = {
            "difficulty": difficulty,
            "elapsed_seconds": elapsed_seconds,
            "duration_ms": reference.get("duration_ms", 0),
            "note_count": len(reference.get("notes", [])),
        }
        (job_dir / "job.json").write_text(
            json.dumps(job_data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        append_log(job_dir, f"Analysis completed in {elapsed_seconds}s")
        return job_data
    except Exception as exc:
        append_log(job_dir, f"Analysis failed: {exc}")
        append_log(job_dir, traceback.format_exc())
        raise HTTPException(500, str(exc)) from exc


async def post_analysis_result(
    *,
    title: str,
    artist: str,
    difficulty: int,
    duration: int,
    album_img_path: Path,
    album_img_filename: str,
    album_img_content_type: str,
    lyrics_path: Path,
    lyrics_filename: str,
    lyrics_content_type: str,
    midi_path: Path,
    mr_path: Path,
    filename_prefix: str,
    callback_url: str | None = None,
    internal_api_key: str | None = None,
) -> dict:
    target_callback_url = (callback_url or BACKEND_CALLBACK_URL or "").strip()
    target_internal_api_key = (internal_api_key or INTERNAL_API_KEY or "").strip()
    if not target_callback_url:
        raise HTTPException(
            500,
            "Callback URL was not supplied and BACKEND_ANALYSIS_RESULT_URL is not configured.",
        )
    try:
        parsed_callback_url = httpx.URL(target_callback_url)
    except Exception as exc:
        raise HTTPException(400, "Invalid backend callback URL.") from exc
    if parsed_callback_url.scheme not in {"http", "https"} or not parsed_callback_url.host:
        raise HTTPException(400, "Backend callback URL must be an absolute HTTP(S) URL.")
    if not target_internal_api_key:
        raise HTTPException(
            500,
            "Internal API key was not supplied and AI_INTERNAL_API_KEY is not configured.",
        )

    with (
        album_img_path.open("rb") as album_img_file,
        lyrics_path.open("rb") as lyrics_file,
        midi_path.open("rb") as midi_file,
        mr_path.open("rb") as mr_file,
    ):
        files = {
            "albumImg": (album_img_filename, album_img_file, album_img_content_type),
            "lyrics": (lyrics_filename, lyrics_file, lyrics_content_type),
            "midi": (
                f"{filename_prefix}_midi.json",
                midi_file,
                "application/json",
            ),
            "mr": (f"{filename_prefix}_mr.mp3", mr_file, "audio/mpeg"),
        }
        data = {
            "title": title,
            "artist": artist,
            "difficulty": str(difficulty),
            "duration": str(duration),
        }
        headers = {"X-AI-API-Key": target_internal_api_key}
        try:
            timeout = httpx.Timeout(
                connect=10.0,
                read=BACKEND_CALLBACK_TIMEOUT_SECONDS,
                write=BACKEND_CALLBACK_TIMEOUT_SECONDS,
                pool=10.0,
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await asyncio.wait_for(
                    client.post(
                        target_callback_url,
                        data=data,
                        files=files,
                        headers=headers,
                    ),
                    timeout=BACKEND_CALLBACK_TIMEOUT_SECONDS,
                )
        except asyncio.TimeoutError as exc:
            raise HTTPException(
                504,
                "Backend callback timed out after "
                f"{BACKEND_CALLBACK_TIMEOUT_SECONDS:g} seconds.",
            ) from exc
        except httpx.RequestError as exc:
            raise HTTPException(502, f"Backend callback request failed: {exc}") from exc

    if response.status_code != 200:
        raise HTTPException(
            502,
            f"Backend callback failed with {response.status_code}: {response.text[:500]}",
        )
    try:
        result = response.json()
    except ValueError as exc:
        raise HTTPException(502, "Backend callback returned invalid JSON.") from exc
    if not isinstance(result, dict) or not isinstance(result.get("songId"), int):
        raise HTTPException(502, "Backend callback response is missing a numeric songId.")
    return result


@app.post(
    "/api/v1/admin/songs/analyze",
    response_model=AnalysisAcceptedResponse,
    status_code=202,
    include_in_schema=False,
)
@app.post(
    "/api/admin/songs",
    response_model=AnalysisAcceptedResponse,
    status_code=202,
)
async def create_song_analysis(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    artist: str = Form(...),
    ticket: str = Form(...),
    lyrics: UploadFile = File(...),
    albumImg: UploadFile = File(...),
    originalMp3: UploadFile = File(...),
):
    verify_upload_ticket(ticket)
    if not title.strip():
        raise HTTPException(400, "title must not be empty.")
    if not artist.strip():
        raise HTTPException(400, "artist must not be empty.")

    original_suffix = Path(originalMp3.filename or "").suffix.lower()
    cover_suffix = Path(albumImg.filename or "").suffix.lower()
    lyrics_suffix = Path(lyrics.filename or "").suffix.lower()
    if original_suffix != ".mp3":
        raise HTTPException(400, "originalMp3 must be an .mp3 file.")
    if cover_suffix not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(400, "Unsupported albumImg file type.")
    if lyrics_suffix not in ALLOWED_TEXT_EXTENSIONS:
        raise HTTPException(400, "Unsupported lyrics file type.")

    job_id = str(uuid.uuid4())
    job_dir = STORAGE_DIR / job_id
    job_dir.mkdir(parents=True)

    original_path = job_dir / f"original{original_suffix}"
    album_img_path = job_dir / f"album_img{cover_suffix}"
    lyrics_path = job_dir / f"lyrics{lyrics_suffix}"
    album_img_filename = Path(albumImg.filename or "album-image").name
    lyrics_filename = Path(lyrics.filename or "lyrics").name
    album_img_content_type = albumImg.content_type or "application/octet-stream"
    lyrics_content_type = lyrics.content_type or "application/octet-stream"
    filename_prefix = build_result_filename_prefix(artist, title)
    try:
        await save_upload(originalMp3, original_path, MAX_AUDIO_SIZE)
        await save_upload(albumImg, album_img_path, MAX_IMAGE_SIZE)
        await save_upload(lyrics, lyrics_path, MAX_TEXT_SIZE)
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise

    async def process_job() -> dict:
        job_completed = False
        try:
            result = await run_in_threadpool(analyze_song, job_dir, original_path, 10)
            from services.syllable_highlighter import (
                HighlightConfig,
                add_syllable_highlights,
            )

            await run_in_threadpool(
                add_syllable_highlights,
                job_dir / "reference.json",
                original_path,
                job_dir / "lead_vocal.wav",
                lyrics_path,
                config=HighlightConfig.from_environment(
                    model_dir=SYLLABLE_MODEL_DIR,
                ),
                logger=lambda message: append_log(job_dir, message),
            )
            duration_seconds = int(round(result["duration_ms"] / 1000))
            append_log(
                job_dir,
                f"MR MP3 encoding started: bitrate={BACKEND_CALLBACK_MP3_BITRATE}",
            )
            mr_mp3_path = await run_in_threadpool(
                encode_mr_mp3,
                job_dir / "instrumental.wav",
                job_dir / "instrumental.mp3",
            )
            append_log(
                job_dir,
                f"MR MP3 encoding completed: {mr_mp3_path.stat().st_size} bytes",
            )
            append_log(job_dir, f"Backend callback started: {BACKEND_CALLBACK_URL}")
            callback_result = await post_analysis_result(
                title=title,
                artist=artist,
                difficulty=result["difficulty"],
                duration=duration_seconds,
                album_img_path=album_img_path,
                album_img_filename=album_img_filename,
                album_img_content_type=album_img_content_type,
                lyrics_path=lyrics_path,
                lyrics_filename=lyrics_filename,
                lyrics_content_type=lyrics_content_type,
                midi_path=job_dir / "reference.json",
                mr_path=mr_mp3_path,
                filename_prefix=filename_prefix,
            )
            append_log(
                job_dir,
                f"Backend callback completed: songId={callback_result.get('songId')}",
            )
            local_result_dir = preserve_local_results(
                job_id,
                job_dir,
                {
                    "job_id": job_id,
                    "songId": callback_result.get("songId"),
                    "title": title,
                    "artist": artist,
                    "difficulty": result["difficulty"],
                    "duration": duration_seconds,
                    "elapsed_seconds": result["elapsed_seconds"],
                },
                filename_prefix,
            )
            response_data = {
                "job_id": job_id,
                "songId": callback_result.get("songId"),
                "difficulty": result["difficulty"],
                "duration": duration_seconds,
                "elapsed_seconds": result["elapsed_seconds"],
                "backend": callback_result,
                "files": {
                    "midi": f"{filename_prefix}_midi.json",
                    "mr": f"{filename_prefix}_mr.mp3",
                },
            }
            if local_result_dir is not None:
                response_data["local_result_dir"] = f"local_results/{job_id}"
            job_completed = True
            return response_data
        except asyncio.CancelledError:
            append_log(
                job_dir,
                "Job cancelled before completion because the worker is shutting down",
            )
            raise
        except Exception as exc:
            append_log(job_dir, f"Job failed: {exc}")
            raise
        finally:
            if job_completed or not PRESERVE_FAILED_JOBS:
                shutil.rmtree(job_dir, ignore_errors=True)
            else:
                append_log(job_dir, f"Failed job artifacts preserved: {job_dir}")

    async def run_job_in_background() -> None:
        try:
            await process_job()
        except asyncio.CancelledError:
            LOGGER.warning("[%s] Background analysis task was cancelled", job_id)
            raise
        except Exception:
            LOGGER.exception("Unhandled background analysis error for job %s", job_id)

    background_tasks.add_task(run_job_in_background)
    return AnalysisAcceptedResponse(jobId=job_id)
