from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from services import syllable_highlighter as highlighter


class LyricsParsingTest(unittest.TestCase):
    def test_lrc_parses_offset_metadata_enhanced_tags_and_multiple_timestamps(
        self,
    ) -> None:
        parsed = highlighter.parse_lrc_text(
            "\n".join(
                (
                    "[ar:테스트 가수]",
                    "[ti:테스트 곡]",
                    "[offset: +250]",
                    "[00:01.50][00:03.005] 네<00:01.750>가",
                    "[00:05] 다음",
                )
            )
        )

        self.assertEqual(parsed.text, "네가\n네가\n다음")
        self.assertEqual([line.text for line in parsed.lines], ["네가", "네가", "다음"])
        self.assertEqual([line.index for line in parsed.lines], [0, 1, 2])
        self.assertEqual([line.source_line for line in parsed.lines], [3, 3, 4])
        self.assertTrue(parsed.has_complete_anchors)
        self.assertEqual(
            [(anchor.start, anchor.next_start) for anchor in parsed.anchors],
            [(1.75, 3.255), (3.255, 5.25), (5.25, None)],
        )

    def test_json_timed_lines_honor_millisecond_units_and_explicit_ends(self) -> None:
        parsed = highlighter.parse_json_lyrics(
            {
                "timeline": {"unit": "ms"},
                "lines": [
                    {"lyric": "둘", "start": 2250, "end": 3000},
                    {"text": "하나", "start_ms": 1000, "end_ms": 1800},
                ],
            }
        )

        self.assertEqual(parsed.text, "하나\n둘")
        self.assertEqual([line.text for line in parsed.lines], ["하나", "둘"])
        self.assertTrue(parsed.has_complete_anchors)
        self.assertEqual(
            [
                (anchor.start, anchor.next_start, anchor.explicit_end)
                for anchor in parsed.anchors
            ],
            [(1.0, 2.25, 1.8), (2.25, None, 3.0)],
        )

    def test_json_untimed_or_partially_timed_lines_fall_back_to_plain_lyrics(
        self,
    ) -> None:
        parsed = highlighter.parse_json_lyrics(
            {
                "items": [
                    {"content": "첫 줄", "start_ms": 1000},
                    "둘째 줄",
                    {"text": "셋째 줄"},
                    {"text": "   ", "start_ms": 4000},
                ]
            }
        )

        self.assertEqual(parsed.text, "첫 줄\n둘째 줄\n셋째 줄")
        self.assertEqual(
            [line.text for line in parsed.lines],
            ["첫 줄", "둘째 줄", "셋째 줄"],
        )
        self.assertEqual(parsed.anchors, ())
        self.assertFalse(parsed.has_complete_anchors)

    def test_partially_timed_lrc_keeps_every_line_and_uses_plain_fallback(self) -> None:
        parsed = highlighter.parse_lrc_text(
            "[00:01.00] 만남\n타임 없는 번역\n[00:03.00] 이별"
        )

        self.assertEqual(parsed.text, "만남\n타임 없는 번역\n이별")
        self.assertEqual(
            [line.text for line in parsed.lines],
            ["만남", "타임 없는 번역", "이별"],
        )
        self.assertEqual(parsed.anchors, ())
        self.assertFalse(parsed.has_complete_anchors)

    def test_timestamped_txt_is_treated_as_lrc_content(self) -> None:
        with tempfile.TemporaryDirectory(prefix="timestamped-txt-test-") as root:
            path = Path(root) / "lyrics.txt"
            path.write_text("[00:01.25]네", encoding="utf-8")

            parsed = highlighter.parse_lyrics_file(path)

        self.assertTrue(parsed.has_complete_anchors)
        self.assertEqual(parsed.lines[0].text, "네")
        self.assertEqual(parsed.anchors[0].start, 1.25)


class FlattenAlignmentDocumentTest(unittest.TestCase):
    def test_emits_exact_ms_schema_and_omits_unmatched_or_invalid_units(self) -> None:
        document = {
            "schema_version": "1.0",
            "lines": [
                {
                    "index": 7,
                    "syllables": [
                        {
                            "text": "네",
                            "start": 15.7804,
                            "end": 15.9806,
                            "confidence": 0.7934,
                        },
                        {
                            "text": "가",
                            "start": None,
                            "end": None,
                            "confidence": 0.1,
                        },
                        {
                            "text": "역전",
                            "start": 4.0,
                            "end": 3.0,
                            "confidence": 0.9,
                        },
                    ],
                },
                {
                    "index": "not-an-index",
                    "units": [
                        {
                            "syllable": "라",
                            "start": 0.0014,
                            "end": 0.0026,
                            "score": "0.5004",
                        }
                    ],
                },
            ],
        }

        result = highlighter.flatten_alignment_document(document)

        self.assertEqual(
            result,
            {
                "time_unit": "ms",
                "method": "uploaded-lrc-anchor+ctc+heldnote",
                "syllables": [
                    {
                        "syllable": "네",
                        "start_ms": 15780,
                        "end_ms": 15981,
                        "duration_ms": 201,
                        "line": 7,
                        "score": 0.793,
                    },
                    {
                        "syllable": "라",
                        "start_ms": 1,
                        "end_ms": 3,
                        "duration_ms": 2,
                        "line": 1,
                        "score": 0.5,
                    },
                ],
            },
        )
        self.assertEqual(
            list(result),
            ["time_unit", "method", "syllables"],
        )
        self.assertEqual(
            list(result["syllables"][0]),
            [
                "syllable",
                "start_ms",
                "end_ms",
                "duration_ms",
                "line",
                "score",
            ],
        )


class AddSyllableHighlightsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory(
            prefix="syllable-highlighter-test-"
        )
        self.root = Path(self.temporary_directory.name)
        self.reference_path = self.root / "midi.json"
        self.audio_path = self.root / "original.mp3"
        self.vocals_path = self.root / "lead_vocal.wav"
        self.lyrics_path = self.root / "lyrics.lrc"
        self.audio_path.write_bytes(b"mock-original")
        self.vocals_path.write_bytes(b"mock-vocal")
        self.lyrics_path.write_text("[00:01.00] 네가", encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_fail_open_preserves_reference_and_installs_empty_wrapper(self) -> None:
        original = {
            "duration_ms": 12_345,
            "tempo": 98.5,
            "notes": [
                {"pitch": 60, "start_ms": 100, "duration_ms": 250},
                {"pitch": 64, "start_ms": 500, "duration_ms": 500},
            ],
            "metadata": {"title": "원본", "nested": {"kept": True}},
            "custom": [1, {"two": 2}],
        }
        snapshot = copy.deepcopy(original)
        self.reference_path.write_text(
            json.dumps(original, ensure_ascii=False),
            encoding="utf-8",
        )
        messages: list[str] = []

        with (
            patch.object(
                highlighter,
                "_run_original_stt_vocal_pipeline",
                side_effect=highlighter.SyllableHighlightError("alignment failed"),
            ) as align,
            patch.object(highlighter, "_release_model_memory"),
        ):
            result = highlighter.add_syllable_highlights(
                self.reference_path,
                self.audio_path,
                self.vocals_path,
                self.lyrics_path,
                config=highlighter.HighlightConfig(device="cpu", strict=False),
                logger=messages.append,
            )

        align.assert_called_once()
        expected_wrapper = {
            "time_unit": "ms",
            "method": "uploaded-lrc-anchor+ctc+heldnote",
            "syllables": [],
        }
        self.assertEqual(result, expected_wrapper)
        persisted = json.loads(self.reference_path.read_text(encoding="utf-8"))
        self.assertEqual(
            persisted,
            {**snapshot, "syllable_highlights": expected_wrapper},
        )
        self.assertTrue(any("failed" in message.lower() for message in messages))

    def test_strict_mode_surfaces_alignment_failure(self) -> None:
        self.reference_path.write_text(
            json.dumps({"duration_ms": 12_345, "notes": []}),
            encoding="utf-8",
        )

        with (
            patch.object(
                highlighter,
                "_run_original_stt_vocal_pipeline",
                side_effect=highlighter.SyllableHighlightError("alignment failed"),
            ),
            patch.object(highlighter, "_release_model_memory"),
            self.assertRaisesRegex(
                highlighter.SyllableHighlightError,
                "alignment failed",
            ),
        ):
            highlighter.add_syllable_highlights(
                self.reference_path,
                self.audio_path,
                self.vocals_path,
                self.lyrics_path,
                config=highlighter.HighlightConfig(device="cpu", strict=True),
            )

        self.assertEqual(
            json.loads(self.reference_path.read_text(encoding="utf-8")),
            {"duration_ms": 12_345, "notes": []},
        )

    def test_mocked_success_adds_highlights_without_changing_existing_midi(
        self,
    ) -> None:
        original = {
            "schema_version": "2.0",
            "duration_ms": 8_000,
            "tempo_changes": [{"at_ms": 0, "bpm": 120}],
            "notes": [
                {"midi": 60, "start_ms": 1000, "end_ms": 1250},
                {"midi": 62, "start_ms": 1250, "end_ms": 1500},
            ],
            "analysis": {"key": "C", "sections": ["verse", "chorus"]},
        }
        snapshot = copy.deepcopy(original)
        self.reference_path.write_text(
            json.dumps(original, ensure_ascii=False),
            encoding="utf-8",
        )
        alignment_document = {
            "lines": [
                {
                    "index": 0,
                    "syllables": [
                        {
                            "text": "네",
                            "start": 1.0,
                            "end": 1.201,
                            "confidence": 0.793,
                        },
                        {
                            "text": "가",
                            "start": 1.201,
                            "end": 1.5,
                            "confidence": 0.9,
                        },
                    ],
                }
            ]
        }

        with (
            patch.object(
                highlighter,
                "_run_original_stt_vocal_pipeline",
                return_value=alignment_document,
            ) as align,
            patch.object(highlighter, "_release_model_memory"),
        ):
            result = highlighter.add_syllable_highlights(
                self.reference_path,
                self.audio_path,
                self.vocals_path,
                self.lyrics_path,
                config=highlighter.HighlightConfig(device="cpu", strict=True),
            )

        self.assertEqual(
            result,
            {
                "time_unit": "ms",
                "method": "uploaded-lrc-anchor+ctc+heldnote",
                "syllables": [
                    {
                        "syllable": "네",
                        "start_ms": 1000,
                        "end_ms": 1201,
                        "duration_ms": 201,
                        "line": 0,
                        "score": 0.793,
                    },
                    {
                        "syllable": "가",
                        "start_ms": 1201,
                        "end_ms": 1500,
                        "duration_ms": 299,
                        "line": 0,
                        "score": 0.9,
                    },
                ],
            },
        )
        align.assert_called_once()
        self.assertEqual(align.call_args.kwargs["audio_path"], self.audio_path)
        self.assertEqual(align.call_args.kwargs["vocals_path"], self.vocals_path)
        self.assertNotIn("[00:", align.call_args.args[0].text)
        self.assertEqual(len(align.call_args.args[0].lines), 1)

        persisted = json.loads(self.reference_path.read_text(encoding="utf-8"))
        self.assertEqual(set(persisted), {*snapshot, "syllable_highlights"})
        for key, value in snapshot.items():
            with self.subTest(key=key):
                self.assertEqual(persisted[key], value)
        self.assertEqual(persisted["syllable_highlights"], result)

    def test_original_pipeline_receives_original_audio_and_provided_vocal(
        self,
    ) -> None:
        parsed = highlighter.parse_lrc_text("[00:01.00] first line\n[00:03.00] second")
        model_dir = self.root / "models" / "whisper"
        alignment_document = {"schema_version": "1.0", "lines": []}

        def fake_run_align(args) -> None:
            args.output.write_text(
                json.dumps(alignment_document),
                encoding="utf-8",
            )

        with patch(
            "services.stt_vocal.cli._run_align",
            side_effect=fake_run_align,
        ) as run_align:
            result = highlighter._run_original_stt_vocal_pipeline(
                parsed,
                audio_path=self.audio_path,
                vocals_path=self.vocals_path,
                config=highlighter.HighlightConfig(
                    device="cpu",
                    model_dir=model_dir,
                ),
            )

        self.assertEqual(result, alignment_document)
        run_align.assert_called_once()
        args = run_align.call_args.args[0]
        self.assertEqual(args.audio, self.audio_path)
        self.assertEqual(args.vocals, self.vocals_path)
        self.assertEqual(
            args.lyrics.read_text(encoding="utf-8"),
            "first line\nsecond",
        )
        self.assertNotIn("[00:", args.lyrics.read_text(encoding="utf-8"))
        self.assertEqual(args.model, "large-v3")
        self.assertEqual(args.device, "cpu")
        self.assertTrue(args.whisperx)
        self.assertFalse(args.no_activity_filter)
        self.assertIsNone(args.alignment_json)
        self.assertFalse(args.skip_separation)
        self.assertEqual(args.model_dir, model_dir)

        from services.stt_vocal.models import AlignConfig

        runtime_config = AlignConfig(
            audio=args.audio,
            lyrics=args.lyrics,
            output=args.output,
            vocals=args.vocals,
            alignment_json=args.alignment_json,
            skip_separation=args.skip_separation,
        )
        self.assertFalse(runtime_config.needs_separation)
        self.assertEqual(runtime_config.transcription_audio, self.vocals_path)


class RuntimeWiringTest(unittest.TestCase):
    def test_service_adapter_defaults_to_the_vendored_alignment_runtime(self) -> None:
        from services.stt_vocal.adapters import WhisperXAlignmentBackend

        backend = WhisperXAlignmentBackend(device="cpu")

        self.assertEqual(
            backend._load_module().__name__,
            "services._vendor.whisperx_align",
        )


if __name__ == "__main__":
    unittest.main()
