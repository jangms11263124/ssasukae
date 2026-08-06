import { ApiError } from './client';
import { resolveApiErrorMessage, toUserFacingMessage } from './errorResponse';

export function getApiErrorMessage(error: unknown, fallback = '요청에 실패했습니다.'): string {
  if (error instanceof ApiError) {
    return resolveApiErrorMessage(error.message, error.code, fallback);
  }

  // TypeError: Failed to fetch 같은 브라우저 원문은 노출하지 않는다.
  if (error instanceof Error) {
    return toUserFacingMessage(error.message, fallback);
  }

  return fallback;
}

export function isApiErrorCode(error: unknown, code: string): error is ApiError {
  return error instanceof ApiError && error.code === code;
}
