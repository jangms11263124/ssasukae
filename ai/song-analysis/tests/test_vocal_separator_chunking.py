from __future__ import annotations

import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from services.vocal_separator import _merge_short_final_chunk, _prepare_separator_input


class _FakeAudioSegment:
    durations: dict[str, int] = {}

    def __init__(self, duration_ms: int):
        self.duration_ms = duration_ms

    def __len__(self) -> int:
        return self.duration_ms

    def __add__(self, other: "_FakeAudioSegment") -> "_FakeAudioSegment":
        return _FakeAudioSegment(self.duration_ms + other.duration_ms)

    @classmethod
    def from_file(cls, path: str | Path) -> "_FakeAudioSegment":
        return cls(cls.durations[str(path)])

    def export(self, path: str | Path, format: str) -> None:
        if format != "wav":
            raise AssertionError(f"unexpected format: {format}")
        self.durations[str(path)] = self.duration_ms
        Path(path).write_bytes(b"merged")


class ShortFinalChunkTest(unittest.TestCase):
    def setUp(self) -> None:
        _FakeAudioSegment.durations = {}
        self.pydub_module = types.SimpleNamespace(AudioSegment=_FakeAudioSegment)

    def _chunk(self, directory: Path, name: str, duration_ms: int) -> str:
        path = directory / name
        path.write_bytes(b"chunk")
        _FakeAudioSegment.durations[str(path)] = duration_ms
        return str(path)

    def test_merges_sub_ten_second_tail_into_previous_chunk(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            previous = self._chunk(directory, "chunk_0005.wav", 30_000)
            final = self._chunk(directory, "chunk_0006.wav", 1_600)

            with patch.dict(sys.modules, {"pydub": self.pydub_module}):
                result = _merge_short_final_chunk([previous, final])

            self.assertEqual(result, [previous])
            self.assertEqual(_FakeAudioSegment.durations[previous], 31_600)
            self.assertFalse(Path(final).exists())

    def test_keeps_ten_second_or_longer_tail(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            previous = self._chunk(directory, "chunk_0000.wav", 30_000)
            final = self._chunk(directory, "chunk_0001.wav", 10_000)

            with patch.dict(sys.modules, {"pydub": self.pydub_module}):
                result = _merge_short_final_chunk([previous, final])

            self.assertEqual(result, [previous, final])
            self.assertTrue(Path(final).exists())

    def test_cannot_merge_a_single_short_chunk(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            only = self._chunk(Path(temp_dir), "chunk_0000.wav", 1_600)

            with patch.dict(sys.modules, {"pydub": self.pydub_module}):
                result = _merge_short_final_chunk([only])

            self.assertEqual(result, [only])

    def test_prepare_input_uses_the_resolved_ffmpeg_executable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            source = directory / "original.mp3"
            source.write_bytes(b"mp3")
            ffmpeg_path = directory / "imageio-ffmpeg"

            def fake_run(command, **kwargs):
                self.assertEqual(str(ffmpeg_path), command[0])
                Path(command[-1]).write_bytes(b"wav")
                return types.SimpleNamespace(returncode=0, stderr="")

            with patch(
                "services.vocal_separator.subprocess.run",
                side_effect=fake_run,
            ):
                result = _prepare_separator_input(source, directory, ffmpeg_path)

            self.assertEqual(directory / "separator_input.wav", result)
            self.assertEqual(b"wav", result.read_bytes())


if __name__ == "__main__":
    unittest.main()
