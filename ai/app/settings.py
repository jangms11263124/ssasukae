import os


def cors_origins() -> list[str]:
    """환경 변수의 CORS 허용 주소를 쉼표 단위로 분리해 목록으로 반환합니다."""
    return [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "*").split(",")
        if origin.strip()
    ]
