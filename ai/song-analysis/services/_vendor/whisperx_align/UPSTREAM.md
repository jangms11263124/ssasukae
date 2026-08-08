# WhisperX align-only vendoring

- Upstream: https://github.com/m-bain/whisperX
- Version: `3.8.6`
- Wheel SHA-256: `cb6d4fcd3fb6c42305cb8b222a33a0b78f6b657e9db3b714345fe43dc0a69c1f`
- License: BSD-2-Clause (see `LICENSE`)

Only the forced-alignment runtime (`alignment`, `audio`, `utils`, `schema`,
and `log_utils`) is included. ASR, diarization, VAD, and subtitle modules are
intentionally excluded so this service can retain its existing Torch/CUDA
stack and vocal-separation implementation.
