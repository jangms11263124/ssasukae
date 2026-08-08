import os
from typing import Any

import httpx

from app.settings import load_environment


load_environment()


class SpringApiError(RuntimeError):
    """Spring 내부 API 호출 실패와 해당 HTTP 상태 코드를 함께 전달하는 예외입니다."""

    def __init__(self, message: str, status_code: int | None = None):
        """오류 메시지와 선택적인 Spring 응답 상태 코드를 저장합니다."""
        super().__init__(message)
        self.status_code = status_code


async def report_scoring_result(
    performance_id: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """확정된 채점 결과를 Spring 내부 API에 전달하고 JSON 응답을 반환합니다.

    환경 변수, 네트워크, HTTP 응답 또는 JSON 형식이 올바르지 않으면 호출자가 구분해
    처리할 수 있도록 예외를 발생시킵니다.
    """
    base_url = os.getenv("SPRING_API_BASE_URL", "").rstrip("/")
    api_key = os.getenv("AI_INTERNAL_API_KEY")
    if not base_url:
        raise RuntimeError("SPRING_API_BASE_URL environment variable is required.")
    if not api_key:
        raise RuntimeError("AI_INTERNAL_API_KEY environment variable is required.")

    timeout = float(os.getenv("SPRING_API_TIMEOUT_SECONDS", "10"))
    url = f"{base_url}/internal/api/performance-result/{performance_id}/result"
    headers = {
        "Content-Type": "application/json",
        "X-AI-API-Key": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:
        raise SpringApiError(f"Spring API request failed: {exc}") from exc

    if response.is_error:
        try:
            detail = response.json()
        except ValueError:
            detail = response.text
        raise SpringApiError(
            f"Spring API returned {response.status_code}: {detail}",
            status_code=response.status_code,
        )

    try:
        result = response.json()
    except ValueError as exc:
        raise SpringApiError("Spring API returned an invalid JSON response.") from exc

    return result
