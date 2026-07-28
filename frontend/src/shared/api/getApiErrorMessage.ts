import { ApiError } from './client';
import { resolveApiErrorMessage } from './errorResponse';

export function getApiErrorMessage(error: unknown, fallback = '요청에 실패했습니다.'): string {
  if (error instanceof ApiError) {
    return resolveApiErrorMessage(error.message, error.code, fallback);
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function isApiErrorCode(error: unknown, code: string): error is ApiError {
  return error instanceof ApiError && error.code === code;
}
