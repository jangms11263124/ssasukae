from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import feedback, score, stt
from app.settings import cors_origins


app = FastAPI()

# 개발 중 프론트엔드에서 FastAPI를 직접 호출할 수 있도록 CORS를 허용합니다.
# 배포 주소가 추가되면 CORS_ORIGINS 환경 변수에 쉼표로 구분해 넣으면 됩니다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    """애플리케이션이 정상 실행 중인지 확인하는 기본 상태 응답을 반환합니다."""
    # 서버가 실행 중인지 확인하는 가장 간단한 상태 확인 API입니다.
    return {"status": "ok"}


@app.get("/ping", status_code=200)
def ping():
    """클라이언트와 모니터링 도구가 서버 연결 상태를 확인할 수 있게 응답합니다."""
    # 모니터링 도구나 프론트엔드 연결 확인에서 사용할 수 있는 ping API입니다.
    return {"status": "ok"}


app.include_router(stt.router)
app.include_router(score.router)
app.include_router(feedback.router)
