import { getQueryClient } from '@/shared/api/queryClient';
import { isSessionKickedMessage } from '@/shared/config/session';
import { getAccessToken, useAuthStore } from '@/shared/model/authStore';
import { showToast } from '@/shared/model/toastStore';

import { API_ERROR_CODE, parseErrorResponse } from './errorResponse';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
  /** 내부 재시도 여부. 호출부에서 지정하지 않음 */
  _retried?: boolean;
}

let refreshInFlight: Promise<string> | null = null;

function isSessionKickedError(message: string, code?: string) {
  return code === API_ERROR_CODE.SESSION_EXPIRED || isSessionKickedMessage(message);
}

function handleSessionEnd(message: string, code?: string) {
  // 메모리에 세션이 있을 때만 토스트 (부트스트랩 시 잔여 refresh 쿠키로 반복 노출 방지)
  const hadSession = Boolean(getAccessToken());

  useAuthStore.getState().clearAccessToken();
  // userQueryKeys.all === ['user']
  getQueryClient().removeQueries({ queryKey: ['user'] });

  if (hadSession && isSessionKickedError(message, code)) {
    showToast(message, 'error');
  }
}

export async function refreshStoredAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const { message, code, status } = await parseErrorResponse(response);
        handleSessionEnd(message, code);
        throw new ApiError(message, status, code);
      }

      const data = (await response.json()) as { accessToken: string };
      useAuthStore.getState().setAccessToken(data.accessToken);
      return data.accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = false, headers, _retried = false, ...rest } = options;

  const requestHeaders = new Headers(headers);

  // FormData는 브라우저가 boundary 포함 Content-Type을 직접 지정해야 하므로 그대로 보낸다.
  let requestBody: BodyInit | undefined;
  if (body instanceof FormData) {
    requestBody = body;
  } else if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  if (auth) {
    const accessToken = getAccessToken();

    if (accessToken) {
      requestHeaders.set('Authorization', `Bearer ${accessToken}`);
    }
  }

  const response = await fetch(path, {
    ...rest,
    credentials: 'include',
    headers: requestHeaders,
    body: requestBody,
  });

  if (
    response.status === 401 &&
    auth &&
    !_retried &&
    path !== '/api/auth/refresh'
  ) {
    try {
      await refreshStoredAccessToken();
      return apiClient<T>(path, { ...options, _retried: true });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('인증이 필요합니다.', 401);
    }
  }

  if (!response.ok) {
    const { message, code, status } = await parseErrorResponse(response);

    if (isSessionKickedError(message, code)) {
      handleSessionEnd(message, code);
    }

    throw new ApiError(message, status, code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
