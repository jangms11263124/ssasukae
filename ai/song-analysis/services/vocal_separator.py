from __future__ import annotations

import contextvars
import os
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


_ACTIVE_MERGE_LOGGER: contextvars.ContextVar[Callable[[str], None] | None] = (
    contextvars.ContextVar("active_audio_merge_logger", default=None)
)
_CHUNK_MERGE_PATCH_LOCK = threading.Lock()
_MIN_SAFE_AUDIO_CHUNK_MS = 10_000


def _format_bytes(value: int | None) -> str:
    if value is None:
        return "unknown"
    amount = float(value)
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if amount < 1024 or unit == "TiB":
            return f"{amount:.1f}{unit}"
        amount /= 1024
    return f"{amount:.1f}TiB"


def _read_text(path: str) -> str | None:
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return None


def _read_first_int(paths: tuple[str, ...]) -> int | None:
    for path in paths:
        raw_value = _read_text(path)
        if raw_value is None or raw_value == "max":
            continue
        try:
            value = int(raw_value)
        except ValueError:
            continue
        # cgroup v1 can report a huge sentinel value when no limit is configured.
        if value >= 1 << 60:
            continue
        return value
    return None


def _proc_kib_value(path: str, key: str) -> int | None:
    contents = _read_text(path)
    if not contents:
        return None
    for line in contents.splitlines():
        if not line.startswith(f"{key}:"):
            continue
        fields = line.split()
        if len(fields) >= 2 and fields[1].isdigit():
            return int(fields[1]) * 1024
    return None


def _memory_snapshot() -> str:
    process_rss = _proc_kib_value("/proc/self/status", "VmRSS")
    host_total = _proc_kib_value("/proc/meminfo", "MemTotal")
    host_available = _proc_kib_value("/proc/meminfo", "MemAvailable")
    container_current = _read_first_int(
        (
            "/sys/fs/cgroup/memory.current",
            "/sys/fs/cgroup/memory/memory.usage_in_bytes",
        )
    )
    container_limit = _read_first_int(
        (
            "/sys/fs/cgroup/memory.max",
            "/sys/fs/cgroup/memory/memory.limit_in_bytes",
        )
    )

    parts = [f"process_rss={_format_bytes(process_rss)}"]
    if container_current is not None or container_limit is not None:
        parts.append(
            "container_ram="
            f"{_format_bytes(container_current)}/{_format_bytes(container_limit)}"
        )
    if host_total is not None:
        parts.append(
            f"host_available={_format_bytes(host_available)}/{_format_bytes(host_total)}"
        )

    memory_events = _read_text("/sys/fs/cgroup/memory.events")
    if memory_events:
        event_values = {}
        for line in memory_events.splitlines():
            fields = line.split()
            if len(fields) == 2 and fields[1].isdigit():
                event_values[fields[0]] = fields[1]
        parts.append(
            "cgroup_events="
            f"oom={event_values.get('oom', '0')},"
            f"oom_kill={event_values.get('oom_kill', '0')}"
        )
    else:
        fail_count = _read_first_int(
            ("/sys/fs/cgroup/memory/memory.failcnt",)
        )
        if fail_count is not None:
            parts.append(f"cgroup_failcnt={fail_count}")

    nvidia_smi = shutil.which("nvidia-smi")
    if nvidia_smi:
        try:
            gpu_result = subprocess.run(
                [
                    nvidia_smi,
                    "--query-gpu=name,memory.used,memory.total",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            if gpu_result.returncode == 0 and gpu_result.stdout.strip():
                gpu_summaries = []
                for line in gpu_result.stdout.splitlines():
                    fields = [field.strip() for field in line.split(",")]
                    if len(fields) >= 3:
                        gpu_summaries.append(
                            f"{fields[0]} {fields[1]}/{fields[2]}MiB"
                        )
                if gpu_summaries:
                    parts.append("gpu=" + " | ".join(gpu_summaries))
        except (OSError, subprocess.SubprocessError):
            pass

    return "; ".join(parts)


def _emit_merge_log(message: str) -> None:
    callback = _ACTIVE_MERGE_LOGGER.get()
    if callback:
        callback(message)


def _merge_short_final_chunk(chunk_paths: list[str]) -> list[str]:
    """Merge a sub-10-second tail into the preceding audio chunk.

    audio-separator 0.44.5 enables a short-audio MDXC override below ten
    seconds. Some MelBand Roformer models then fail during overlap-add, so a
    fixed-duration split must not leave a tiny final chunk.
    """
    if len(chunk_paths) < 2:
        return chunk_paths

    from pydub import AudioSegment

    previous_path = Path(chunk_paths[-2])
    final_path = Path(chunk_paths[-1])
    final_chunk = AudioSegment.from_file(final_path)
    final_duration_ms = len(final_chunk)
    if final_duration_ms >= _MIN_SAFE_AUDIO_CHUNK_MS:
        return chunk_paths

    previous_chunk = AudioSegment.from_file(previous_path)
    combined_chunk = previous_chunk + final_chunk
    output_format = previous_path.suffix.lstrip(".") or "wav"
    combined_chunk.export(previous_path, format=output_format)
    final_path.unlink()

    _emit_merge_log(
        "Merged short final input chunk into its predecessor: "
        f"tail={final_duration_ms / 1000:.2f}s, "
        f"combined={len(combined_chunk) / 1000:.2f}s, "
        f"chunks={len(chunk_paths)}->{len(chunk_paths) - 1}"
    )
    return chunk_paths[:-1]


def _install_chunk_merge_logging() -> None:
    """Install chunk safety handling and job-aware merge diagnostics."""
    from audio_separator.separator.audio_chunking import AudioChunker

    with _CHUNK_MERGE_PATCH_LOCK:
        current_split = AudioChunker.split_audio
        if not getattr(current_split, "_vocal_service_short_tail_fix", False):
            original_split = current_split

            def split_audio_without_short_tail(self, input_path, output_dir):
                chunk_paths = list(original_split(self, input_path, output_dir))
                return _merge_short_final_chunk(chunk_paths)

            split_audio_without_short_tail._vocal_service_short_tail_fix = True
            AudioChunker.split_audio = split_audio_without_short_tail

        current_merge = AudioChunker.merge_chunks
        if not getattr(current_merge, "_vocal_service_diagnostics", False):
            original_merge = current_merge

            def merge_chunks_with_diagnostics(self, chunk_paths, output_path):
                started_at = time.perf_counter()
                chunk_bytes = sum(
                    Path(chunk_path).stat().st_size
                    for chunk_path in chunk_paths
                    if Path(chunk_path).is_file()
                )
                output_parent = Path(output_path).resolve().parent
                try:
                    disk_free = shutil.disk_usage(output_parent).free
                except OSError:
                    disk_free = None
                _emit_merge_log(
                    "Chunk merge started: "
                    f"output={output_path}, chunks={len(chunk_paths)}, "
                    f"chunk_bytes={_format_bytes(chunk_bytes)}, "
                    f"disk_free={_format_bytes(disk_free)}, {_memory_snapshot()}"
                )
                try:
                    result = original_merge(self, chunk_paths, output_path)
                except BaseException as exc:
                    _emit_merge_log(
                        "Chunk merge interrupted: "
                        f"output={output_path}, elapsed={time.perf_counter() - started_at:.3f}s, "
                        f"error={type(exc).__name__}: {exc}, {_memory_snapshot()}"
                    )
                    raise

                output_size = (
                    Path(output_path).stat().st_size
                    if Path(output_path).is_file()
                    else None
                )
                _emit_merge_log(
                    "Chunk merge completed: "
                    f"output={output_path}, elapsed={time.perf_counter() - started_at:.3f}s, "
                    f"output_bytes={_format_bytes(output_size)}, {_memory_snapshot()}"
                )
                return result

            merge_chunks_with_diagnostics._vocal_service_diagnostics = True
            AudioChunker.merge_chunks = merge_chunks_with_diagnostics


def _chunk_duration_from_env() -> int | None:
    raw_value = os.getenv("AUDIO_SEPARATOR_CHUNK_DURATION_SECONDS", "30").strip()
    if not raw_value or raw_value == "0":
        return None
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ValueError(
            "AUDIO_SEPARATOR_CHUNK_DURATION_SECONDS must be a positive integer or 0."
        ) from exc
    if value < 0:
        raise ValueError(
            "AUDIO_SEPARATOR_CHUNK_DURATION_SECONDS must be a positive integer or 0."
        )
    return value


def _ensure_ffmpeg_on_path() -> Path:
    local_bin = Path(__file__).resolve().parents[1] / "bin"
    os.environ["PATH"] = f"{local_bin}{os.pathsep}{os.environ.get('PATH', '')}"
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return Path(system_ffmpeg).resolve()
    try:
        import imageio_ffmpeg
    except ImportError as exc:
        raise VocalSeparationError("ffmpeg executable was not found.") from exc
    ffmpeg_path = Path(imageio_ffmpeg.get_ffmpeg_exe()).resolve()
    if not ffmpeg_path.is_file():
        raise VocalSeparationError(f"ffmpeg executable was not found: {ffmpeg_path}")
    return ffmpeg_path


def _prepare_separator_input(
    source_path: Path,
    job_dir: Path,
    ffmpeg_path: Path,
) -> Path:
    if source_path.suffix.lower() == ".wav":
        return source_path

    output_path = job_dir / "separator_input.wav"
    completed = subprocess.run(
        [
            str(ffmpeg_path),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source_path),
            "-vn",
            "-ac",
            "2",
            "-ar",
            "44100",
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0 or not output_path.exists():
        detail = completed.stderr.strip() or "unknown ffmpeg error"
        raise VocalSeparationError(f"입력 음원을 WAV로 변환하지 못했습니다: {detail}")
    return output_path


@dataclass(frozen=True)
class SeparationConfig:
    first_model: str = os.getenv(
        "VOCAL_MODEL",
        "model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt",
    )
    second_model: str = os.getenv(
        "LEAD_VOCAL_MODEL",
        "UVR_MDXNET_KARA_2.onnx",
    )
    model_dir: Path = Path(
        os.getenv("AUDIO_SEPARATOR_MODEL_DIR", "storage/models")
    )
    output_format: str = "WAV"
    use_autocast: bool = os.getenv("AUDIO_SEPARATOR_AUTOCAST", "1") == "1"
    use_directml: bool = os.getenv("AUDIO_SEPARATOR_DIRECTML", "0") == "1"
    # audio-separator 0.44.5 reuses an MP3 input subtype when writing WAV via
    # soundfile, which can silently leave chunk outputs missing.
    use_soundfile: bool = os.getenv("AUDIO_SEPARATOR_USE_SOUNDFILE", "0") == "1"
    chunk_duration: int | None = _chunk_duration_from_env()


class VocalSeparationError(RuntimeError):
    pass


def _separator_class():
    try:
        from audio_separator.separator import Separator
    except ImportError as exc:
        raise VocalSeparationError(
            "audio-separator가 설치되어 있지 않습니다. "
            "NVIDIA GPU는 pip install \"audio-separator[gpu]\", "
            "CPU는 pip install \"audio-separator[cpu]\"를 실행하세요."
        ) from exc
    return Separator


def _resolve_outputs(output_dir: Path, names: list[str]) -> list[Path]:
    paths: list[Path] = []
    for name in names:
        path = Path(name)
        if not path.is_absolute():
            path = output_dir / path
        paths.append(path)
    return paths


def _require_output(paths: list[Path], expected_name: str) -> Path:
    for path in paths:
        if path.exists() and path.name.lower() == expected_name.lower():
            return path
    available = ", ".join(path.name for path in paths) or "없음"
    raise VocalSeparationError(
        f"분리 모델이 {expected_name} 파일을 만들지 못했습니다. 생성 결과: {available}"
    )


def _separate_one(separator, source_path: Path, output_names: dict[str, str]) -> list[str]:
    # Separator.separate() catches model exceptions and returns an empty list.
    # This service processes one known file, so call the pinned library's single-file
    # path directly and preserve the original error for API and RunPod diagnostics.
    try:
        outputs = separator._separate_file(str(source_path), output_names)
    except Exception as exc:
        raise VocalSeparationError(f"오디오 분리 실행 실패: {exc}") from exc
    if not outputs:
        raise VocalSeparationError("오디오 분리 실행이 결과 파일을 반환하지 않았습니다.")
    return list(outputs)


def separate_lead_vocal(
    source_path: Path,
    job_dir: Path,
    cfg: SeparationConfig | None = None,
    logger: Callable[[str], None] | None = None,
) -> dict[str, Path]:
    """원곡을 2단계로 분리하고 최종 메인 보컬 WAV만 반환한다."""
    cfg = cfg or SeparationConfig()
    ffmpeg_path = _ensure_ffmpeg_on_path()
    separator_input = _prepare_separator_input(source_path, job_dir, ffmpeg_path)
    cfg.model_dir.mkdir(parents=True, exist_ok=True)
    first_dir = job_dir / "stage1_vocals"
    second_dir = job_dir / "stage2_lead"
    first_dir.mkdir(parents=True, exist_ok=True)
    second_dir.mkdir(parents=True, exist_ok=True)

    Separator = _separator_class()

    def log(message: str) -> None:
        if logger:
            logger(message)

    try:
        _install_chunk_merge_logging()
    except Exception as exc:
        log(f"Chunk merge diagnostics unavailable: {type(exc).__name__}: {exc}")

    common = {
        "model_file_dir": str(cfg.model_dir),
        "output_format": cfg.output_format,
        "use_autocast": cfg.use_autocast,
        "use_directml": cfg.use_directml,
        "use_soundfile": cfg.use_soundfile,
        "chunk_duration": cfg.chunk_duration,
    }
    log(
        "Memory options: "
        f"use_soundfile={cfg.use_soundfile}, "
        f"chunk_duration={cfg.chunk_duration or 'disabled'}s"
    )
    log(f"Separation memory at start: {_memory_snapshot()}")
    if separator_input != source_path:
        log(f"입력 음원 표준화 완료: {source_path.name} -> {separator_input.name}")

    log(f"1차 보컬 분리 모델 로딩: {cfg.first_model}")
    first = Separator(output_dir=str(first_dir), **common)
    first.load_model(model_filename=cfg.first_model)
    merge_log_token = _ACTIVE_MERGE_LOGGER.set(log)
    try:
        first_names = _separate_one(
            first,
            separator_input,
            {
                "Vocals": "all_vocals",
                "Instrumental": "instrumental",
            },
        )
    finally:
        _ACTIVE_MERGE_LOGGER.reset(merge_log_token)
    first_paths = _resolve_outputs(first_dir, list(first_names))
    all_vocals = _require_output(first_paths, "all_vocals.wav")
    instrumental = _require_output(first_paths, "instrumental.wav")
    log("1차 분리 완료: 전체 보컬 / 반주")

    # Release the first model before loading another large model.
    del first
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass
    log(f"Separation memory after first model release: {_memory_snapshot()}")

    log(f"2차 메인 보컬 분리 모델 로딩: {cfg.second_model}")
    second = Separator(output_dir=str(second_dir), **common)
    second.load_model(model_filename=cfg.second_model)
    merge_log_token = _ACTIVE_MERGE_LOGGER.set(log)
    try:
        second_names = _separate_one(
            second,
            all_vocals,
            {
                "Vocals": "lead_vocal",
                "Instrumental": "backing_vocals",
            },
        )
    finally:
        _ACTIVE_MERGE_LOGGER.reset(merge_log_token)
    second_paths = _resolve_outputs(second_dir, list(second_names))
    lead_source = _require_output(second_paths, "lead_vocal.wav")
    backing_source = _require_output(second_paths, "backing_vocals.wav")

    lead_target = job_dir / "lead_vocal.wav"
    instrumental_target = job_dir / "instrumental.wav"
    shutil.copy2(lead_source, lead_target)
    shutil.copy2(instrumental, instrumental_target)

    # 최종 결과에 필요한 lead_vocal.wav와 instrumental.wav만 job_dir에 보존하고
    # 모델별 중간 작업 디렉터리는 정리한다.
    shutil.rmtree(first_dir, ignore_errors=True)
    shutil.rmtree(second_dir, ignore_errors=True)

    log("2차 분리 완료: 메인 보컬 및 MR 생성")
    return {
        "lead_vocal": lead_target,
        "instrumental": instrumental_target,
    }
