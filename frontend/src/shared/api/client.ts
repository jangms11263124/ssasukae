import { getQueryClient } from '@/shared/api/queryClient';
import { isSessionKickedMessage } from '@/shared/config/session';
import { getAccessToken, useAuthStore } from '@/shared/model/authStore';
import { showToast } from '@/shared/model/toastStore';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
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

async function parseErrorMessage(response: Response): Promise<string> {
  let message = '요청에 실패했습니다.';

  try {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const errorBody = (await response.json()) as { message?: string; error?: string };
      message = errorBody.message ?? errorBody.error ?? message;
    } else {
      const errorText = (await response.text()).trim();
      if (errorText) {
        message = errorText;
      }
    }
  } catch {
    // ignore parse errors
  }

  return message;
}

function handleSessionEnd(message: string) {
  useAuthStore.getState().clearAccessToken();
  // userQueryKeys.all === ['user']
  getQueryClient().removeQueries({ queryKey: ['user'] });

  if (isSessionKickedMessage(message)) {
    showToast(message, 'error');
  }
}

async function reissueAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response);
        handleSessionEnd(message);
        throw new ApiError(message, response.status);
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

  if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
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
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (
    response.status === 401 &&
    auth &&
    !_retried &&
    path !== '/api/auth/refresh'
  ) {
    try {
      await reissueAccessToken();
      return apiClient<T>(path, { ...options, _retried: true });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('인증이 필요합니다.', 401);
    }
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response);

    if (isSessionKickedMessage(message)) {
      handleSessionEnd(message);
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
