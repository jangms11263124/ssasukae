"""Optional model and tool adapters for the offline karaoke pipeline.

The module itself deliberately depends only on the Python standard library.
Demucs, openai-whisper, and WhisperX are discovered only when their adapter is
actually used, which keeps JSON-only workflows and unit tests lightweight.
"""

from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher
import importlib
import json
import math
from pathlib import Path
import subprocess
import sys
from typing import Any, Callable, IO, Mapping, Protocol, Sequence, runtime_checkable
import unicodedata


PathLike = str | Path
ModuleLoader = Callable[[str], Any]


class AdapterError(RuntimeError):
    """Base error raised by an external model/tool adapter."""


class OptionalDependencyError(AdapterError):
    """Raised when an adapter's optional dependency is not installed."""


class ExternalToolError(AdapterError):
    """Raised when an external command fails or produces no usable output."""


class AlignmentFormatError(AdapterError, ValueError):
    """Raised when imported alignment JSON does not match the documented schema."""


def _finite_number(value: Any, field: str) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{field} must be a finite number, not a boolean")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be a finite number; got {value!r}") from exc
    if not math.isfinite(number):
        raise ValueError(f"{field} must be finite; got {value!r}")
    return number


def _optional_number(value: Any, field: str) -> float | None:
    if value is None:
        return None
    return _finite_number(value, field)


@dataclass(frozen=True, slots=True)
class AudioClip:
    """A half-open source-audio interval, in seconds."""

    start: float
    end: float

    def __post_init__(self) -> None:
        start = _finite_number(self.start, "clip.start")
        end = _finite_number(self.end, "clip.end")
        if start < 0:
            raise ValueError("clip.start must be non-negative")
        if end <= start:
            raise ValueError("clip.end must be greater than clip.start")
        object.__setattr__(self, "start", start)
        object.__setattr__(self, "end", end)


@dataclass(frozen=True, slots=True)
class AdapterWord:
    """A word timestamp returned by openai-whisper."""

    text: str
    start: float
    end: float
    score: float | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.text, str) or not self.text:
            raise ValueError("word text must be a non-empty string")
        start = _finite_number(self.start, "word.start")
        end = _finite_number(self.end, "word.end")
        if start < 0 or end < start:
            raise ValueError("word timestamps must satisfy 0 <= start <= end")
        object.__setattr__(self, "start", start)
        object.__setattr__(self, "end", end)
        object.__setattr__(self, "score", _optional_number(self.score, "word.score"))


@dataclass(frozen=True, slots=True)
class AdapterSegment:
    """A coarse Whisper segment with optional word timestamps."""

    text: str
    start: float
    end: float
    words: tuple[AdapterWord, ...] = ()
    avg_logprob: float | None = None
    no_speech_prob: float | None = None
    compression_ratio: float | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.text, str):
            raise ValueError("segment text must be a string")
        start = _finite_number(self.start, "segment.start")
        end = _finite_number(self.end, "segment.end")
        if start < 0 or end < start:
            raise ValueError("segment timestamps must satisfy 0 <= start <= end")
        object.__setattr__(self, "start", start)
        object.__setattr__(self, "end", end)
        object.__setattr__(self, "words", tuple(self.words))
        object.__setattr__(
            self, "avg_logprob", _optional_number(self.avg_logprob, "segment.avg_logprob")
        )
        object.__setattr__(
            self,
            "no_speech_prob",
            _optional_number(self.no_speech_prob, "segment.no_speech_prob"),
        )
        object.__setattr__(
            self,
            "compression_ratio",
            _optional_number(self.compression_ratio, "segment.compression_ratio"),
        )


@dataclass(frozen=True, slots=True)
class AlignmentSpan:
    """A normalized, timed character/phoneme/word from an aligner."""

    token: str
    start: float
    end: float
    score: float | None = None
    kind: str = "char"
    line_index: int | None = None
    char_start: int | None = None
    char_end: int | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.token, str) or self.token == "":
            raise ValueError("alignment token must be a non-empty string")
        start = _finite_number(self.start, "alignment.start")
        end = _finite_number(self.end, "alignment.end")
        if start < 0 or end < start:
            raise ValueError("alignment timestamps must satisfy 0 <= start <= end")
        if not isinstance(self.kind, str) or not self.kind:
            raise ValueError("alignment kind must be a non-empty string")
        if self.line_index is not None:
            if isinstance(self.line_index, bool) or not isinstance(self.line_index, int):
                raise ValueError("alignment line_index must be an integer")
            if self.line_index < 0:
                raise ValueError("alignment line_index must be non-negative")
        if (self.char_start is None) != (self.char_end is None):
            raise ValueError("alignment character offsets must be provided together")
        if self.char_start is not None and self.char_end is not None:
            if (
                isinstance(self.char_start, bool)
                or isinstance(self.char_end, bool)
                or not isinstance(self.char_start, int)
                or not isinstance(self.char_end, int)
            ):
                raise ValueError("alignment character offsets must be integers")
            if self.char_start < 0 or self.char_end <= self.char_start:
                raise ValueError(
                    "alignment offsets must satisfy 0 <= char_start < char_end"
                )
        object.__setattr__(self, "start", start)
        object.__setattr__(self, "end", end)
        object.__setattr__(self, "score", _optional_number(self.score, "alignment.score"))


@runtime_checkable
class ForcedAlignBackend(Protocol):
    """Interface implemented by all forced-alignment sources."""

    def align(
        self,
        audio_path: PathLike,
        transcript: Any = None,
        *,
        language: str | None = None,
    ) -> list[AlignmentSpan]:
        """Align ``transcript`` to ``audio_path`` on the original timeline."""


class DemucsSeparator:
    """Run Demucs in two-stem mode and return the generated vocal stem.

    Demucs is invoked as a subprocess so importing this module never imports
    torch. By default the current Python interpreter runs ``python -m demucs``;
    callers may inject a command prefix and runner for packaged installations or
    tests.
    """

    def __init__(
        self,
        *,
        model: str = "htdemucs",
        device: str | None = None,
        executable: str | Sequence[str] | None = None,
        extra_args: Sequence[str] = (),
        runner: Callable[..., Any] = subprocess.run,
    ) -> None:
        if not model:
            raise ValueError("Demucs model name must not be empty")
        if executable is None:
            command_prefix = (sys.executable, "-m", "demucs")
        elif isinstance(executable, str):
            command_prefix = (executable,)
        else:
            command_prefix = tuple(executable)
        if not command_prefix:
            raise ValueError("Demucs executable command must not be empty")
        self.model = model
        self.device = device
        self.command_prefix = command_prefix
        self.extra_args = tuple(extra_args)
        self._runner = runner

    def build_command(self, audio_path: PathLike, output_dir: PathLike) -> list[str]:
        command = [
            *self.command_prefix,
            "--two-stems",
            "vocals",
            "--name",
            self.model,
            # Demucs defaults to one random time shift.  That can produce a
            # slightly different vocal stem on every run, which in turn can
            # move a low-confidence CTC boundary by several frames.  Karaoke
            # alignment needs repeatable input more than shift augmentation.
            "--shifts",
            "0",
            "--out",
            str(Path(output_dir)),
        ]
        if self.device:
            command.extend(("--device", self.device))
        command.extend(self.extra_args)
        command.append(str(Path(audio_path)))
        return command

    def separate(self, audio_path: PathLike, output_dir: PathLike) -> Path:
        audio = Path(audio_path)
        if not audio.is_file():
            raise FileNotFoundError(f"Input audio does not exist: {audio}")
        output = Path(output_dir)
        output.mkdir(parents=True, exist_ok=True)
        command = self.build_command(audio, output)

        try:
            completed = self._runner(
                command,
                check=False,
                capture_output=True,
                text=True,
            )
        except FileNotFoundError as exc:
            raise OptionalDependencyError(
                "Demucs command was not found. Install it with `pip install demucs` "
                "or pass DemucsSeparator(executable=...)."
            ) from exc
        except subprocess.CalledProcessError as exc:
            detail = (exc.stderr or exc.stdout or "").strip()
            raise ExternalToolError(
                f"Demucs failed with exit code {exc.returncode}"
                + (f": {detail}" if detail else ".")
            ) from exc

        returncode = int(getattr(completed, "returncode", 0))
        if returncode != 0:
            detail = str(
                getattr(completed, "stderr", "")
                or getattr(completed, "stdout", "")
                or ""
            ).strip()
            hint = " Install the optional dependency with `pip install demucs`."
            raise ExternalToolError(
                f"Demucs failed with exit code {returncode}."
                + (f" Output: {detail}" if detail else "")
                + hint
            )

        expected = output / self.model / audio.stem / "vocals.wav"
        if expected.is_file():
            return expected

        candidates = [
            candidate
            for candidate in output.rglob("vocals.wav")
            if candidate.parent.name == audio.stem
        ]
        if len(candidates) == 1:
            return candidates[0]
        if len(candidates) > 1:
            rendered = ", ".join(str(candidate) for candidate in candidates)
            raise ExternalToolError(
                f"Demucs produced multiple possible vocal stems for {audio.name}: {rendered}"
            )
        raise ExternalToolError(
            "Demucs exited successfully but no vocals.wav was found under "
            f"{output}. Command: {' '.join(command)}"
        )


def _normalize_clip_timestamps(
    clip_timestamps: str | Sequence[float | Sequence[float] | AudioClip] | None,
) -> str | list[float] | None:
    if clip_timestamps is None or isinstance(clip_timestamps, str):
        return clip_timestamps

    values = list(clip_timestamps)
    if not values:
        raise ValueError("clip_timestamps must not be empty")

    if all(isinstance(value, AudioClip) for value in values):
        clips = [(value.start, value.end) for value in values]
        return [timestamp for clip in clips for timestamp in clip]

    nested = all(
        isinstance(value, Sequence) and not isinstance(value, (str, bytes))
        for value in values
    )
    if nested:
        flattened: list[float] = []
        previous_end = -1.0
        for index, value in enumerate(values):
            pair = list(value)  # type: ignore[arg-type]
            if len(pair) != 2:
                raise ValueError(f"clip_timestamps[{index}] must contain [start, end]")
            clip = AudioClip(pair[0], pair[1])
            if clip.start < previous_end:
                raise ValueError("clip_timestamps must be ordered and non-overlapping")
            flattened.extend((clip.start, clip.end))
            previous_end = clip.end
        return flattened

    if any(
        isinstance(value, Sequence) and not isinstance(value, (str, bytes))
        for value in values
    ):
        raise ValueError("clip_timestamps cannot mix flat values and [start, end] pairs")
    flattened = [
        _finite_number(value, f"clip_timestamps[{index}]")
        for index, value in enumerate(values)
    ]
    if any(value < 0 for value in flattened):
        raise ValueError("clip timestamps must be non-negative")
    if any(right < left for left, right in zip(flattened, flattened[1:])):
        raise ValueError("clip timestamps must be in non-decreasing order")
    return flattened


class WhisperTranscriber:
    """Lazy adapter for the openai-whisper Python package."""

    _FIXED_OPTIONS = {
        "word_timestamps",
        "condition_on_previous_text",
        "temperature",
        "clip_timestamps",
        "language",
    }

    def __init__(
        self,
        model_name: str = "large-v3",
        *,
        device: str | None = None,
        download_root: PathLike | None = None,
        model: Any = None,
        model_loader: Callable[..., Any] | None = None,
        module_loader: ModuleLoader = importlib.import_module,
    ) -> None:
        if not model_name:
            raise ValueError("Whisper model name must not be empty")
        self.model_name = model_name
        self.device = device
        self.download_root = Path(download_root) if download_root is not None else None
        self._model = model
        self._model_loader = model_loader
        self._module_loader = module_loader

    def _load_model(self) -> Any:
        if self._model is not None:
            return self._model
        load_kwargs: dict[str, Any] = {}
        if self.device is not None:
            load_kwargs["device"] = self.device
        if self.download_root is not None:
            load_kwargs["download_root"] = str(self.download_root)

        loader = self._model_loader
        if loader is None:
            try:
                whisper = self._module_loader("whisper")
            except (ImportError, ModuleNotFoundError) as exc:
                raise OptionalDependencyError(
                    "openai-whisper is not installed. Install the optional dependency "
                    "with `pip install -U openai-whisper`."
                ) from exc
            loader = whisper.load_model
        try:
            self._model = loader(self.model_name, **load_kwargs)
        except OptionalDependencyError:
            raise
        except Exception as exc:
            raise AdapterError(
                f"Could not load Whisper model {self.model_name!r}: {exc}"
            ) from exc
        return self._model

    def transcribe(
        self,
        audio_path: PathLike,
        *,
        clip_timestamps: str
        | Sequence[float | Sequence[float] | AudioClip]
        | None = None,
        language: str | None = None,
        **decode_options: Any,
    ) -> list[AdapterSegment]:
        """Transcribe selected source intervals without concatenating the audio.

        Passing source intervals directly through Whisper's ``clip_timestamps``
        keeps all returned timestamps on the original media timeline.
        """

        conflicts = self._FIXED_OPTIONS.intersection(decode_options)
        if conflicts:
            rendered = ", ".join(sorted(conflicts))
            raise ValueError(f"These safety-critical options are fixed by the adapter: {rendered}")
        audio = Path(audio_path)
        if not audio.is_file():
            raise FileNotFoundError(f"Input audio does not exist: {audio}")

        options = dict(decode_options)
        options.update(
            word_timestamps=True,
            condition_on_previous_text=False,
            temperature=0.0,
        )
        normalized_clips = _normalize_clip_timestamps(clip_timestamps)
        if normalized_clips is not None:
            options["clip_timestamps"] = normalized_clips
        if language is not None:
            if not language.strip():
                raise ValueError("language must not be blank")
            options["language"] = language

        model = self._load_model()
        try:
            result = model.transcribe(str(audio), **options)
        except Exception as exc:
            raise AdapterError(f"Whisper transcription failed for {audio}: {exc}") from exc
        if not isinstance(result, Mapping):
            raise AdapterError("Whisper returned a non-object transcription result")
        raw_segments = result.get("segments", [])
        if not isinstance(raw_segments, Sequence) or isinstance(raw_segments, (str, bytes)):
            raise AdapterError("Whisper result field 'segments' must be a list")
        return [self._coerce_segment(segment, index) for index, segment in enumerate(raw_segments)]

    def audio_duration(self, audio_path: PathLike) -> float:
        """Decode an input with OpenAI Whisper's loader and return seconds.

        This is a fallback for containers such as MP3/M4A when ``ffprobe`` is
        unavailable. Whisper always decodes at 16 kHz, so the sample count is
        an exact duration for the same waveform later passed to the model.
        """

        audio = Path(audio_path)
        if not audio.is_file():
            raise FileNotFoundError(f"Input audio does not exist: {audio}")
        try:
            whisper = self._module_loader("whisper")
        except (ImportError, ModuleNotFoundError) as exc:
            raise OptionalDependencyError(
                "openai-whisper is not installed; audio duration could not be decoded"
            ) from exc
        try:
            samples = whisper.load_audio(str(audio))
            duration = len(samples) / 16_000.0
        except Exception as exc:
            raise AdapterError(f"Could not decode audio duration for {audio}: {exc}") from exc
        if not math.isfinite(duration) or duration <= 0:
            raise AdapterError(f"Decoded audio duration is invalid for {audio}")
        return duration

    @staticmethod
    def _coerce_segment(segment: Any, index: int) -> AdapterSegment:
        if not isinstance(segment, Mapping):
            raise AdapterError(f"Whisper segment {index} must be an object")
        try:
            start = segment["start"]
            end = segment["end"]
        except KeyError as exc:
            raise AdapterError(f"Whisper segment {index} is missing {exc.args[0]!r}") from exc
        raw_words = segment.get("words", []) or []
        if not isinstance(raw_words, Sequence) or isinstance(raw_words, (str, bytes)):
            raise AdapterError(f"Whisper segment {index} field 'words' must be a list")
        words: list[AdapterWord] = []
        for word_index, word in enumerate(raw_words):
            if not isinstance(word, Mapping):
                raise AdapterError(
                    f"Whisper segment {index} word {word_index} must be an object"
                )
            if "start" not in word or "end" not in word:
                # Whisper can leave punctuation or unaligned tokens without a time.
                continue
            text = word.get("word", word.get("text", ""))
            score = word.get("probability", word.get("score"))
            try:
                words.append(AdapterWord(str(text), word["start"], word["end"], score))
            except ValueError as exc:
                raise AdapterError(
                    f"Invalid Whisper word timestamp at segment {index}, word {word_index}: {exc}"
                ) from exc
        try:
            return AdapterSegment(
                text=str(segment.get("text", "")),
                start=start,
                end=end,
                words=tuple(words),
                avg_logprob=segment.get("avg_logprob"),
                no_speech_prob=segment.get("no_speech_prob"),
                compression_ratio=segment.get("compression_ratio"),
            )
        except ValueError as exc:
            raise AdapterError(f"Invalid Whisper segment {index}: {exc}") from exc

    @staticmethod
    def word_spans(segments: Sequence[AdapterSegment]) -> list[AlignmentSpan]:
        """Flatten Whisper word timestamps into the generic aligner schema."""

        return [
            AlignmentSpan(
                token=word.text,
                start=word.start,
                end=word.end,
                score=word.score,
                kind="word",
                line_index=segment_index,
            )
            for segment_index, segment in enumerate(segments)
            for word in segment.words
        ]


JsonSource = (
    PathLike
    | bytes
    | IO[str]
    | Mapping[str, Any]
    | Sequence[Mapping[str, Any]]
)


class JsonAlignmentBackend:
    """Import character/phoneme/word timings from a small JSON schema.

    Accepted top-level forms are either a list of span objects or
    ``{"spans": [...]}``. Each span requires ``token``, ``start``, and ``end``;
    ``score``, ``kind``, ``line_index``, and character offsets are optional.
    Common producer aliases (``char``, ``phoneme``, ``word``, ``text`` and
    ``confidence``) are accepted.
    """

    def __init__(self, source: JsonSource | Callable[[], JsonSource]) -> None:
        self.source = source

    def align(
        self,
        audio_path: PathLike,
        transcript: Any = None,
        *,
        language: str | None = None,
    ) -> list[AlignmentSpan]:
        del audio_path, transcript, language
        payload = self._read_source(self.source() if callable(self.source) else self.source)
        default_kind = "char"
        if isinstance(payload, Mapping):
            if "spans" not in payload:
                raise AlignmentFormatError("Alignment JSON object must contain a 'spans' list")
            raw_spans = payload["spans"]
            candidate_kind = payload.get("kind", payload.get("unit"))
            if candidate_kind is not None:
                default_kind = str(candidate_kind)
        else:
            raw_spans = payload
        if not isinstance(raw_spans, Sequence) or isinstance(raw_spans, (str, bytes)):
            raise AlignmentFormatError("Alignment JSON spans must be a list")

        spans: list[AlignmentSpan] = []
        for index, item in enumerate(raw_spans):
            if not isinstance(item, Mapping):
                raise AlignmentFormatError(f"Alignment span {index} must be an object")
            token, inferred_kind = self._token_and_kind(item, index, default_kind)
            if "start" not in item or "end" not in item:
                missing = "start" if "start" not in item else "end"
                raise AlignmentFormatError(f"Alignment span {index} is missing {missing!r}")
            kind = str(item.get("kind", inferred_kind))
            score = item.get("score", item.get("confidence", item.get("probability")))
            line_index = item.get("line_index", item.get("line"))
            char_start = item.get("char_start", item.get("character_start"))
            char_end = item.get("char_end", item.get("character_end"))
            try:
                spans.append(
                    AlignmentSpan(
                        token=token,
                        start=item["start"],
                        end=item["end"],
                        score=score,
                        kind=kind,
                        line_index=line_index,
                        char_start=char_start,
                        char_end=char_end,
                    )
                )
            except ValueError as exc:
                raise AlignmentFormatError(f"Invalid alignment span {index}: {exc}") from exc
        return spans

    @staticmethod
    def _token_and_kind(
        item: Mapping[str, Any], index: int, default_kind: str
    ) -> tuple[str, str]:
        for field, inferred_kind in (
            ("token", default_kind),
            ("char", "char"),
            ("phoneme", "phoneme"),
            ("word", "word"),
            ("text", default_kind),
        ):
            if field in item:
                value = item[field]
                if not isinstance(value, str) or value == "":
                    raise AlignmentFormatError(
                        f"Alignment span {index} field {field!r} must be a non-empty string"
                    )
                return value, inferred_kind
        raise AlignmentFormatError(f"Alignment span {index} is missing 'token'")

    @staticmethod
    def _read_source(source: JsonSource) -> Any:
        if isinstance(source, Mapping):
            return source
        if isinstance(source, Sequence) and not isinstance(source, (str, bytes, bytearray)):
            return source
        if isinstance(source, bytes):
            try:
                return json.loads(source.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise AlignmentFormatError(f"Invalid alignment JSON bytes: {exc}") from exc
        if hasattr(source, "read"):
            try:
                return json.load(source)  # type: ignore[arg-type]
            except (TypeError, json.JSONDecodeError) as exc:
                raise AlignmentFormatError(f"Invalid alignment JSON stream: {exc}") from exc
        if isinstance(source, str) and source.lstrip().startswith(("[", "{")):
            try:
                return json.loads(source)
            except json.JSONDecodeError as exc:
                raise AlignmentFormatError(f"Invalid alignment JSON string: {exc}") from exc
        path = Path(source)
        try:
            with path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except FileNotFoundError as exc:
            raise AlignmentFormatError(f"Alignment JSON file does not exist: {path}") from exc
        except json.JSONDecodeError as exc:
            raise AlignmentFormatError(f"Invalid alignment JSON in {path}: {exc}") from exc


class WhisperXAlignmentBackend:
    """Lazy, local WhisperX alignment adapter.

    No API credentials are used. WhisperX may fetch an alignment model on its
    first real invocation; tests can inject a module or preloaded model to avoid
    imports and downloads entirely.
    """

    def __init__(
        self,
        *,
        device: str = "cpu",
        align_model_name: str | None = None,
        module: Any = None,
        module_loader: ModuleLoader = importlib.import_module,
        align_model: Any = None,
        align_metadata: Any = None,
    ) -> None:
        if not device:
            raise ValueError("WhisperX device must not be empty")
        if (align_model is None) != (align_metadata is None):
            raise ValueError("align_model and align_metadata must be provided together")
        self.device = device
        self.align_model_name = align_model_name
        self._module = module
        self._module_loader = module_loader
        self._injected_model = align_model
        self._injected_metadata = align_metadata
        self._model_cache: dict[str, tuple[Any, Any]] = {}

    def _load_module(self) -> Any:
        if self._module is not None:
            return self._module
        module_name = (
            "services._vendor.whisperx_align"
            if (__package__ or "").startswith("services.")
            else "whisperx"
        )
        try:
            self._module = self._module_loader(module_name)
        except (ImportError, ModuleNotFoundError) as exc:
            raise OptionalDependencyError(
                "WhisperX is not installed. Install the optional dependency with "
                "`pip install whisperx`, or use JsonAlignmentBackend."
            ) from exc
        return self._module

    def _load_align_model(self, module: Any, language: str) -> tuple[Any, Any]:
        if self._injected_model is not None:
            return self._injected_model, self._injected_metadata
        if language in self._model_cache:
            return self._model_cache[language]
        kwargs: dict[str, Any] = {"language_code": language, "device": self.device}
        if self.align_model_name is not None:
            kwargs["model_name"] = self.align_model_name
        try:
            pair = module.load_align_model(**kwargs)
        except Exception as exc:
            raise AdapterError(
                f"WhisperX could not load an alignment model for {language!r}: {exc}"
            ) from exc
        if not isinstance(pair, tuple) or len(pair) != 2:
            raise AdapterError("WhisperX load_align_model() must return (model, metadata)")
        self._model_cache[language] = pair
        return pair

    def align(
        self,
        audio_path: PathLike,
        transcript: Any = None,
        *,
        language: str | None = None,
    ) -> list[AlignmentSpan]:
        audio_file = Path(audio_path)
        if not audio_file.is_file():
            raise FileNotFoundError(f"Input audio does not exist: {audio_file}")
        if language is None and isinstance(transcript, Mapping):
            candidate = transcript.get("language")
            if isinstance(candidate, str):
                language = candidate
        if language is None or not language.strip():
            raise ValueError("WhisperX alignment requires an explicit language code")
        if transcript is None:
            raise ValueError("WhisperX alignment requires a transcript")

        module = self._load_module()
        try:
            audio = module.load_audio(str(audio_file))
        except Exception as exc:
            raise AdapterError(f"WhisperX could not load {audio_file}: {exc}") from exc
        segments = self._coerce_segments(transcript, audio, module)
        align_model, metadata = self._load_align_model(module, language)
        try:
            result = module.align(
                segments,
                align_model,
                metadata,
                audio,
                self.device,
                return_char_alignments=True,
            )
        except Exception as exc:
            raise AdapterError(f"WhisperX alignment failed for {audio_file}: {exc}") from exc
        return self._coerce_result(result, segments)

    @staticmethod
    def _coerce_segments(transcript: Any, audio: Any, module: Any) -> list[dict[str, Any]]:
        if isinstance(transcript, str):
            if not transcript.strip():
                raise ValueError("WhisperX transcript must not be blank")
            try:
                duration = len(audio) / float(getattr(module, "SAMPLE_RATE", 16_000))
            except (TypeError, ValueError, ZeroDivisionError) as exc:
                raise AdapterError("Could not determine audio duration for plain transcript") from exc
            return [{"text": transcript, "start": 0.0, "end": duration}]

        raw_segments = transcript.get("segments") if isinstance(transcript, Mapping) else transcript
        if isinstance(raw_segments, AdapterSegment):
            raw_segments = [raw_segments]
        if not isinstance(raw_segments, Sequence) or isinstance(raw_segments, (str, bytes)):
            raise ValueError(
                "WhisperX transcript must be text, timed segments, or {'segments': [...]}"
            )
        coerced: list[dict[str, Any]] = []
        for index, segment in enumerate(raw_segments):
            if isinstance(segment, AdapterSegment):
                text, start, end = segment.text, segment.start, segment.end
            elif isinstance(segment, Mapping):
                if not all(field in segment for field in ("text", "start", "end")):
                    raise ValueError(
                        f"WhisperX transcript segment {index} needs text, start, and end"
                    )
                text, start, end = segment["text"], segment["start"], segment["end"]
            else:
                raise ValueError(f"WhisperX transcript segment {index} must be an object")
            if not isinstance(text, str):
                raise ValueError(f"WhisperX transcript segment {index} text must be a string")
            start_number = _finite_number(start, f"transcript[{index}].start")
            end_number = _finite_number(end, f"transcript[{index}].end")
            if start_number < 0 or end_number < start_number:
                raise ValueError(
                    f"WhisperX transcript segment {index} has invalid timestamps"
                )
            if text.strip():
                coerced.append({"text": text, "start": start_number, "end": end_number})
        if not coerced:
            raise ValueError("WhisperX transcript contains no non-empty timed segments")
        return coerced

    @staticmethod
    def _alignment_text(value: Any) -> str:
        """Return comparison text without punctuation or spacing differences."""

        if not isinstance(value, str):
            return ""
        normalized = unicodedata.normalize("NFKC", value).casefold()
        return "".join(character for character in normalized if character.isalnum())

    @classmethod
    def _segment_text(cls, segment: Mapping[str, Any]) -> str:
        for field in ("text", "word", "char"):
            normalized = cls._alignment_text(segment.get(field))
            if normalized:
                return normalized
        for field, token_fields in (
            ("chars", ("char", "text")),
            ("words", ("word", "text")),
        ):
            items = segment.get(field, []) or []
            if not isinstance(items, Sequence) or isinstance(items, (str, bytes)):
                continue
            pieces: list[str] = []
            for item in items:
                if not isinstance(item, Mapping):
                    continue
                for token_field in token_fields:
                    if isinstance(item.get(token_field), str):
                        pieces.append(str(item[token_field]))
                        break
            normalized = cls._alignment_text("".join(pieces))
            if normalized:
                return normalized
        return ""

    @staticmethod
    def _segment_interval(segment: Mapping[str, Any]) -> tuple[float, float] | None:
        def timestamp(value: Any) -> float | None:
            if isinstance(value, bool):
                return None
            try:
                number = float(value)
            except (TypeError, ValueError):
                return None
            return number if math.isfinite(number) else None

        start = timestamp(segment.get("start"))
        end = timestamp(segment.get("end"))
        if start is not None and end is not None and end >= start:
            return start, end

        starts: list[float] = []
        ends: list[float] = []
        for field in ("chars", "words"):
            items = segment.get(field, []) or []
            if not isinstance(items, Sequence) or isinstance(items, (str, bytes)):
                continue
            for item in items:
                if not isinstance(item, Mapping):
                    continue
                item_start = timestamp(item.get("start"))
                item_end = timestamp(item.get("end"))
                if item_start is not None:
                    starts.append(item_start)
                if item_end is not None:
                    ends.append(item_end)
        if starts and ends and max(ends) >= min(starts):
            return min(starts), max(ends)
        return None

    @staticmethod
    def _temporal_rank(
        output_interval: tuple[float, float] | None,
        source_interval: tuple[float, float] | None,
        *,
        prefer_current: bool,
        source_index: int,
    ) -> tuple[float, ...]:
        current_penalty = 0.0 if prefer_current else 1.0
        if output_interval is None or source_interval is None:
            return (2.0, current_penalty, float(source_index))
        output_start, output_end = output_interval
        source_start, source_end = source_interval
        overlap = max(0.0, min(output_end, source_end) - max(output_start, source_start))
        output_duration = max(output_end - output_start, 1e-9)
        if overlap > 0:
            overlap_ratio = min(1.0, overlap / output_duration)
            midpoint_distance = abs(
                (output_start + output_end) / 2 - (source_start + source_end) / 2
            )
            return (
                0.0,
                -overlap_ratio,
                current_penalty,
                midpoint_distance,
                float(source_index),
            )
        distance = max(source_start - output_end, output_start - source_end, 0.0)
        return (1.0, distance, current_penalty, float(source_index))

    @classmethod
    def _map_result_segments(
        cls,
        result_segments: Sequence[Any],
        source_segments: Sequence[Mapping[str, Any]],
    ) -> list[int]:
        """Map WhisperX subsegments to source lines without moving backwards.

        WhisperX 3.8 can sentence-split one input segment into several output
        segments. Text offsets keep those pieces attached to their source line;
        timestamp overlap disambiguates identical lyrics in later lines. The
        monotonic cursor is important because repeated chorus text must retain
        its original occurrence order.
        """

        if not source_segments:
            return [index for index, _ in enumerate(result_segments)]
        source_texts = [cls._segment_text(segment) for segment in source_segments]
        source_intervals = [cls._segment_interval(segment) for segment in source_segments]
        text_offsets = [0] * len(source_segments)
        current_source = 0
        mapped: list[int] = []

        for raw_segment in result_segments:
            if not isinstance(raw_segment, Mapping):
                mapped.append(current_source)
                continue
            output_text = cls._segment_text(raw_segment)
            output_interval = cls._segment_interval(raw_segment)
            exact_matches: list[tuple[tuple[float, ...], int, int]] = []
            for source_index in range(current_source, len(source_segments)):
                search_start = text_offsets[source_index] if source_index == current_source else 0
                match_at = (
                    source_texts[source_index].find(output_text, search_start)
                    if output_text
                    else -1
                )
                if match_at < 0:
                    continue
                rank = cls._temporal_rank(
                    output_interval,
                    source_intervals[source_index],
                    prefer_current=source_index == current_source,
                    source_index=source_index,
                )
                exact_matches.append((rank, source_index, match_at))

            if exact_matches:
                _, selected, match_at = min(exact_matches, key=lambda candidate: candidate[0])
                text_offsets[selected] = match_at + len(output_text)
            else:
                candidates: list[tuple[tuple[Any, ...], int]] = []
                for source_index in range(current_source, len(source_segments)):
                    search_start = (
                        text_offsets[source_index] if source_index == current_source else 0
                    )
                    remaining = source_texts[source_index][search_start:]
                    similarity = (
                        SequenceMatcher(
                            None, output_text, remaining, autojunk=False
                        ).ratio()
                        if output_text and remaining
                        else 0.0
                    )
                    temporal = cls._temporal_rank(
                        output_interval,
                        source_intervals[source_index],
                        prefer_current=source_index == current_source,
                        source_index=source_index,
                    )
                    candidates.append(((*temporal, -similarity), source_index))
                _, selected = min(candidates, key=lambda candidate: candidate[0])
                if output_text:
                    text_offsets[selected] = min(
                        len(source_texts[selected]),
                        text_offsets[selected] + len(output_text),
                    )

            current_source = selected
            mapped.append(selected)
        return mapped

    @classmethod
    def _coerce_result(
        cls,
        result: Any,
        source_segments: Sequence[Mapping[str, Any]] | None = None,
    ) -> list[AlignmentSpan]:
        if not isinstance(result, Mapping):
            raise AdapterError("WhisperX returned a non-object alignment result")
        spans: list[AlignmentSpan] = []
        result_segments = result.get("segments", [])
        if isinstance(result_segments, Sequence) and not isinstance(
            result_segments, (str, bytes)
        ):
            if source_segments is None:
                line_indices = list(range(len(result_segments)))
            else:
                line_indices = cls._map_result_segments(result_segments, source_segments)
            for segment, line_index in zip(result_segments, line_indices):
                if not isinstance(segment, Mapping):
                    continue
                chars = segment.get("chars", []) or []
                if not isinstance(chars, Sequence) or isinstance(chars, (str, bytes)):
                    continue
                for char in chars:
                    if not isinstance(char, Mapping):
                        continue
                    token = char.get("char", char.get("text"))
                    if not isinstance(token, str) or not token.strip():
                        continue
                    if "start" not in char or "end" not in char:
                        continue
                    try:
                        spans.append(
                            AlignmentSpan(
                                token=token,
                                start=char["start"],
                                end=char["end"],
                                score=char.get("score"),
                                kind="char",
                                line_index=line_index,
                            )
                        )
                    except ValueError as exc:
                        raise AdapterError(f"Invalid WhisperX character timestamp: {exc}") from exc
        if spans:
            return spans

        words = result.get("word_segments", [])
        if isinstance(words, Sequence) and not isinstance(words, (str, bytes)):
            if source_segments is None:
                mapped_word_lines: list[int | None] = [None] * len(words)
            else:
                mapped_word_lines = cls._map_result_segments(words, source_segments)
            for word_index, (word, mapped_line_index) in enumerate(
                zip(words, mapped_word_lines)
            ):
                if not isinstance(word, Mapping):
                    continue
                token = word.get("word", word.get("text"))
                if not isinstance(token, str) or not token.strip():
                    continue
                if "start" not in word or "end" not in word:
                    continue
                try:
                    spans.append(
                        AlignmentSpan(
                            token=token,
                            start=word["start"],
                            end=word["end"],
                            score=word.get("score"),
                            kind="word",
                            line_index=word.get("line_index", mapped_line_index),
                        )
                    )
                except ValueError as exc:
                    raise AdapterError(
                        f"Invalid WhisperX word timestamp at index {word_index}: {exc}"
                    ) from exc
        if not spans:
            raise AdapterError("WhisperX returned no timed characters or words")
        return spans


# Explicit aliases make the package/tool names discoverable without duplicating code.
OpenAIWhisperTranscriber = WhisperTranscriber
WhisperXAlignmentAdapter = WhisperXAlignmentBackend


__all__ = [
    "AdapterError",
    "AdapterSegment",
    "AdapterWord",
    "AlignmentFormatError",
    "AlignmentSpan",
    "AudioClip",
    "DemucsSeparator",
    "ExternalToolError",
    "ForcedAlignBackend",
    "JsonAlignmentBackend",
    "OpenAIWhisperTranscriber",
    "OptionalDependencyError",
    "WhisperTranscriber",
    "WhisperXAlignmentAdapter",
    "WhisperXAlignmentBackend",
]
