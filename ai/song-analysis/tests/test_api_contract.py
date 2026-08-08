import asyncio
import json
import os
import shutil
import sys
import tempfile
import types
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault(
    "AI_UPLOAD_TICKET_SECRET",
    "test-upload-ticket-secret-at-least-32-bytes",
)

import jwt
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient

import main


class SongUploadApiContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(main.app)
        self.temp_dir = Path(tempfile.mkdtemp(prefix="vocal-service-test-"))
        self.original_storage_dir = main.STORAGE_DIR
        main.STORAGE_DIR = self.temp_dir
        main.UPLOAD_TICKET_SECRET = "test-upload-ticket-secret-at-least-32-bytes"

    def tearDown(self) -> None:
        main.STORAGE_DIR = self.original_storage_dir
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def make_ticket(self) -> str:
        now = datetime.now(timezone.utc)
        return jwt.encode(
            {
                "sub": "test-admin",
                "purpose": "SONG_AI_UPLOAD",
                "iat": now,
                "exp": now + timedelta(minutes=10),
            },
            main.UPLOAD_TICKET_SECRET,
            algorithm="HS256",
        )

    def test_openapi_exposes_only_the_canonical_upload_path(self) -> None:
        paths = self.client.get("/openapi.json").json()["paths"]

        self.assertIn("/api/admin/songs", paths)
        self.assertNotIn("/api/v1/admin/songs/analyze", paths)

    def test_upload_is_accepted_and_scheduled_in_the_background(self) -> None:
        with patch.object(BackgroundTasks, "add_task", autospec=True) as add_task:
            response = self.client.post(
                "/api/admin/songs",
                data={
                    "title": "밤양갱",
                    "artist": "비비",
                    "ticket": self.make_ticket(),
                },
                files={
                    "originalMp3": ("original.mp3", b"test-mp3", "audio/mpeg"),
                    "albumImg": ("album.jpg", b"test-jpg", "image/jpeg"),
                    "lyrics": ("lyrics.txt", b"test-lyrics", "text/plain"),
                },
            )

        self.assertEqual(202, response.status_code)
        self.assertEqual("accepted", response.json()["status"])
        self.assertTrue(response.json()["jobId"])
        add_task.assert_called_once()

    def test_cors_preflight_allows_the_frontend_origins(self) -> None:
        for origin in ("https://ssafystar-k.site", "http://localhost:3000"):
            with self.subTest(origin=origin):
                response = self.client.options(
                    "/api/admin/songs",
                    headers={
                        "Origin": origin,
                        "Access-Control-Request-Method": "POST",
                        "Access-Control-Request-Headers": "content-type",
                    },
                )

                self.assertEqual(200, response.status_code)
                self.assertEqual(origin, response.headers["access-control-allow-origin"])

    def test_analysis_keeps_the_separated_instrumental_unmodified(self) -> None:
        job_dir = self.temp_dir / "analysis-job"
        job_dir.mkdir()
        original_path = job_dir / "original.mp3"
        original_path.write_bytes(b"original")
        instrumental_path = job_dir / "instrumental.wav"
        instrumental_path.write_bytes(b"pure-instrumental")
        lead_vocal_path = job_dir / "lead_vocal.wav"
        lead_vocal_path.write_bytes(b"lead-vocal")

        class FakeConfig:
            def __init__(self, **kwargs):
                self.options = kwargs

        def fake_separate(*args, **kwargs):
            return {
                "instrumental": instrumental_path,
                "lead_vocal": lead_vocal_path,
            }

        def fake_build_reference(*args, **kwargs):
            reference_path = job_dir / "reference.json"
            reference_path.write_text(
                json.dumps({"duration_ms": 1_000, "notes": []}),
                encoding="utf-8",
            )
            return reference_path

        reference_builder = types.ModuleType("services.reference_builder")
        reference_builder.AnalysisConfig = FakeConfig
        reference_builder.build_reference = fake_build_reference
        vocal_separator = types.ModuleType("services.vocal_separator")
        vocal_separator.SeparationConfig = FakeConfig
        vocal_separator.separate_lead_vocal = fake_separate

        with patch.dict(
            sys.modules,
            {
                "services.reference_builder": reference_builder,
                "services.vocal_separator": vocal_separator,
            },
        ):
            result = main.analyze_song(job_dir, original_path, hop_ms=10)

        self.assertEqual(1, result["difficulty"])
        self.assertEqual(b"pure-instrumental", instrumental_path.read_bytes())
        self.assertEqual(
            ["instrumental.wav", "lead_vocal.wav"],
            sorted(path.name for path in job_dir.glob("*.wav")),
        )

    def test_background_job_adds_highlights_before_sending_the_midi_callback(
        self,
    ) -> None:
        scheduled: dict[str, object] = {}
        callback_midi: dict[str, object] = {}
        events: list[str] = []

        def capture_task(_background_tasks, function, *args, **kwargs) -> None:
            scheduled.update(function=function, args=args, kwargs=kwargs)

        def fake_analyze(job_dir: Path, original_path: Path, hop_ms: int) -> dict:
            self.assertEqual("original.mp3", original_path.name)
            self.assertEqual(10, hop_ms)
            (job_dir / "reference.json").write_text(
                json.dumps({"duration_ms": 1_000, "notes": [{"pitch": 60}]}),
                encoding="utf-8",
            )
            (job_dir / "lead_vocal.wav").write_bytes(b"lead-vocal")
            (job_dir / "instrumental.wav").write_bytes(b"instrumental")
            events.append("analyze")
            return {"duration_ms": 1_000, "difficulty": 3, "elapsed_seconds": 0.1}

        def fake_add_highlights(
            reference_path: Path,
            original_audio_path: Path,
            vocals_path: Path,
            lyrics_path: Path,
            **kwargs,
        ) -> dict:
            self.assertEqual("reference.json", reference_path.name)
            self.assertEqual("original.mp3", original_audio_path.name)
            self.assertEqual("lead_vocal.wav", vocals_path.name)
            self.assertEqual("lyrics.lrc", lyrics_path.name)
            self.assertEqual(main.SYLLABLE_MODEL_DIR, kwargs["config"].model_dir)
            highlights = {
                "time_unit": "ms",
                "method": "uploaded-lrc-anchor+ctc+heldnote",
                "syllables": [
                    {
                        "syllable": "네",
                        "start_ms": 100,
                        "end_ms": 301,
                        "duration_ms": 201,
                        "line": 0,
                        "score": 0.793,
                    }
                ],
            }
            reference = json.loads(reference_path.read_text(encoding="utf-8"))
            reference["syllable_highlights"] = highlights
            reference_path.write_text(
                json.dumps(reference, ensure_ascii=False),
                encoding="utf-8",
            )
            events.append("highlight")
            return highlights

        def fake_encode(_source_path: Path, output_path: Path) -> Path:
            output_path.write_bytes(b"encoded-mr")
            events.append("encode")
            return output_path

        async def fake_callback(**kwargs) -> dict:
            callback_midi.update(
                json.loads(kwargs["midi_path"].read_text(encoding="utf-8"))
            )
            events.append("callback")
            return {"songId": 321}

        with (
            patch.object(
                BackgroundTasks,
                "add_task",
                autospec=True,
                side_effect=capture_task,
            ),
            patch.object(main, "analyze_song", side_effect=fake_analyze),
            patch(
                "services.syllable_highlighter.add_syllable_highlights",
                side_effect=fake_add_highlights,
            ),
            patch.object(main, "encode_mr_mp3", side_effect=fake_encode),
            patch.object(main, "post_analysis_result", side_effect=fake_callback),
            patch.object(main, "preserve_local_results", return_value=None),
        ):
            response = self.client.post(
                "/api/admin/songs",
                data={
                    "title": "Highlight",
                    "artist": "Test Artist",
                    "ticket": self.make_ticket(),
                },
                files={
                    "originalMp3": ("original.mp3", b"test-mp3", "audio/mpeg"),
                    "albumImg": ("album.jpg", b"test-jpg", "image/jpeg"),
                    "lyrics": (
                        "lyrics.lrc",
                        "[00:00.10]네".encode(),
                        "text/plain",
                    ),
                },
            )
            self.assertEqual(202, response.status_code)
            asyncio.run(
                scheduled["function"](
                    *scheduled["args"],
                    **scheduled["kwargs"],
                )
            )

        self.assertEqual(events, ["analyze", "highlight", "encode", "callback"])
        self.assertEqual(callback_midi["notes"], [{"pitch": 60}])
        self.assertEqual(
            callback_midi["syllable_highlights"]["syllables"][0]["syllable"],
            "네",
        )

if __name__ == "__main__":
    unittest.main()
