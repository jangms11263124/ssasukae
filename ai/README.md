# AI 서비스 실행 및 배포

`ai` 아래에는 서로 독립적으로 실행·배포하는 두 FastAPI 서비스가 있습니다.

| 디렉터리 | 역할 | Python 앱 |
| --- | --- | --- |
| `scoring-feedback` | 가창 채점, STT, RAG 기반 피드백 | `app.main:app` |
| `song-analysis` | 원곡 보컬 분리 및 기준 MIDI/구간 생성 | `main:app` |

두 디렉터리 이름에는 하이픈이 있으므로 상위 폴더에서 Python 패키지처럼 import하지 않습니다. 서비스 디렉터리를 작업 디렉터리로 사용하거나 `uvicorn --app-dir`를 지정합니다.

## 로컬 실행

아래 명령은 저장소 루트에서 시작합니다. 각 서비스의 `.env.example`을 `.env`로 복사한 뒤 빈 secret 값을 실제 값으로 채웁니다.

```powershell
# 채점·피드백: http://localhost:8000
cd ai/scoring-feedback
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000

# 곡 분석: http://localhost:8001
cd ../song-analysis
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8001
```

저장소 루트에서 실행할 때는 각각 `--app-dir ai/scoring-feedback`, `--app-dir ai/song-analysis`를 사용할 수 있습니다.

곡 분석 테스트는 서비스 디렉터리에서 실행합니다.

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
```

아래 RAG 문서 구축·적재 명령은 다시 저장소 루트에서 시작하며, `scoring-feedback`을 작업 디렉터리로 실행합니다.

```powershell
cd ai/scoring-feedback
python -m pip install -r requirements-rag-index.txt
python scripts/build_rag_index.py
python scripts/index_rag_documents_pgvector.py
```

## Docker 빌드

아래 명령은 저장소 루트에서 실행합니다. Docker build context는 `ai`가 아니라 각 서비스 디렉터리여야 합니다.

```bash
docker build -t scoring-feedback -f ai/scoring-feedback/Dockerfile ai/scoring-feedback
docker build -t song-analysis -f ai/song-analysis/Dockerfile ai/song-analysis
```

두 이미지는 컨테이너 내부에서 기본 포트 `8000`을 사용합니다. 동시에 띄울 때는 서로 다른 호스트 포트나 도메인을 연결합니다.

```bash
docker run --env-file ai/scoring-feedback/.env -p 8000:8000 scoring-feedback
docker run --gpus all --env-file ai/song-analysis/.env -p 8001:8000 song-analysis
```

곡 분석의 Whisper 정렬 모델은 최초 사용 시 내려받을 수 있습니다. 재시작마다 다시 받지 않도록 `/app/storage/alignment-models`를 영속 볼륨으로 연결하거나 `SYLLABLE_MODEL_DIR`를 영속 경로로 지정합니다. 이미지에 포함된 보컬 분리 모델이 가려질 수 있으므로 `/app/storage` 전체를 빈 볼륨으로 덮지는 않습니다.

## 서비스 연결값

- 프론트엔드 `NEXT_PUBLIC_AI_BASE_URL`: `scoring-feedback` 공개 주소
- 프론트엔드 `NEXT_PUBLIC_AI_SERVER_URL`: `song-analysis` 공개 주소
- `scoring-feedback`의 `SPRING_API_BASE_URL`: Spring 서버 base URL
- `song-analysis`의 `BACKEND_ANALYSIS_RESULT_URL`: Spring의 전체 곡 분석 콜백 URL
- 양쪽 `AI_INTERNAL_API_KEY`: Spring과 합의한 동일한 내부 API 키

프론트엔드의 `NEXT_PUBLIC_*` 값은 빌드 시 주입되므로 주소를 바꾼 뒤 프론트엔드도 다시 빌드·배포해야 합니다. 폴더 이동 자체는 HTTP API 경로를 바꾸지 않습니다.

## 배포 설정 체크리스트

- 채점 배포의 Root Directory/Build Context: `ai/scoring-feedback`
- 곡 분석 배포의 Root Directory/Build Context: `ai/song-analysis`
- 곡 분석 런타임: NVIDIA GPU 사용 가능 여부와 `--gpus all` 확인
- 두 서비스별 이미지명, 컨테이너, 헬스 체크(`/docs` 또는 `/ping`) 및 도메인 분리
- `.env` 파일을 이미지에 넣지 말고 배포 플랫폼의 secret/environment 설정으로 주입
- 외부 Jenkins/RunPod 설정에 남아 있는 예전 `ai` 루트 build 명령 교체
