import os
from pathlib import Path

from dotenv import load_dotenv


SERVICE_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = SERVICE_ROOT / ".env"


def load_environment() -> bool:
    """현재 작업 디렉터리와 관계없이 서비스 루트의 .env를 불러옵니다."""
    return load_dotenv(ENV_FILE)


def cors_origins() -> list[str]:
    """환경 변수의 CORS 허용 주소를 쉼표 단위로 분리해 목록으로 반환합니다."""
    load_environment()
    return [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "*").split(",")
        if origin.strip()
    ]
