FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

# Syllable alignment failures propagate by default; use strict=0 only for the legacy empty-list fallback.
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MPLBACKEND=Agg \
    AUDIO_SEPARATOR_MODEL_DIR=/app/storage/models \
    VOCAL_MODEL=model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt \
    VOCAL_MODEL_SHA256=21b9d0958e35b8ebfbe2afe69bbd5444e5ffe2f5d80ae0d583b833d2f3c0d139 \
    LEAD_VOCAL_MODEL=UVR_MDXNET_KARA_2.onnx \
    LEAD_VOCAL_MODEL_SHA256=bf32e15105a09c0f7dddd2b67346146334d6f3ecb399ed7638eba2ab07cbf5f4 \
    AUDIO_SEPARATOR_AUTOCAST=1 \
    AUDIO_SEPARATOR_DIRECTML=0 \
    AUDIO_SEPARATOR_USE_SOUNDFILE=0 \
    AUDIO_SEPARATOR_CHUNK_DURATION_SECONDS=30 \
    SYLLABLE_ALIGNMENT_DEVICE=cuda \
    SYLLABLE_WHISPER_MODEL=large-v3 \
    SYLLABLE_ALIGNMENT_STRICT=1 \
    SYLLABLE_MODEL_DIR=/app/storage/alignment-models/whisper \
    HF_HOME=/app/storage/alignment-models/huggingface \
    NLTK_DATA=/usr/local/share/nltk_data \
    BACKEND_CALLBACK_MP3_BITRATE=192k \
    BACKEND_CALLBACK_TIMEOUT_SECONDS=120 \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

WORKDIR /app

RUN set -eux; \
    for attempt in 1 2 3; do \
        if apt-get update -o Acquire::Retries=3 \
            && apt-get install -y --no-install-recommends \
                ca-certificates \
                python3 \
                python3-pip \
                python3-dev \
                build-essential \
                libsndfile1; then \
            break; \
        fi; \
        rm -rf /var/lib/apt/lists/*; \
        if [ "$attempt" = "3" ]; then exit 1; fi; \
        sleep 5; \
    done; \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# The WhisperX forced-alignment runtime is vendored under services/_vendor.
# Installing the full package would replace the separator's pinned Torch
# 2.5/CUDA 12.1 stack with Torch 2.8.
RUN python3 -m pip install --upgrade pip setuptools wheel \
    && python3 -m pip install -r requirements.txt \
    && python3 -m nltk.downloader -d "$NLTK_DATA" punkt_tab

RUN ffmpeg_path="$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')" \
    && ln -sf "$ffmpeg_path" /usr/local/bin/ffmpeg \
    && ffmpeg -version >/dev/null

RUN set -eux; \
    mkdir -p "$AUDIO_SEPARATOR_MODEL_DIR"; \
    for model in "$VOCAL_MODEL" "$LEAD_VOCAL_MODEL"; do \
        for attempt in 1 2 3; do \
            if audio-separator \
                --model_filename "$model" \
                --model_file_dir "$AUDIO_SEPARATOR_MODEL_DIR" \
                --download_model_only; then \
                break; \
            fi; \
            if [ "$attempt" = "3" ]; then exit 1; fi; \
            sleep 5; \
        done; \
        test -s "$AUDIO_SEPARATOR_MODEL_DIR/$model"; \
    done; \
    printf '%s  %s\n%s  %s\n' \
        "$VOCAL_MODEL_SHA256" "$AUDIO_SEPARATOR_MODEL_DIR/$VOCAL_MODEL" \
        "$LEAD_VOCAL_MODEL_SHA256" "$AUDIO_SEPARATOR_MODEL_DIR/$LEAD_VOCAL_MODEL" \
        | sha256sum -c -

COPY main.py .
COPY services ./services

RUN python3 -c 'import torchaudio, whisper; from services._vendor.whisperx_align import alignment; from services.stt_vocal import adapters; assert alignment.Wav2Vec2ForCTC'

EXPOSE 8000

CMD ["sh", "-c", "python3 -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
