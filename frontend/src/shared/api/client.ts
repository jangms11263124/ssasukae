import { getAccessToken } from '@/shared/model/authStore';

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
}

export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = false, headers, ...rest } = options;

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

  if (!response.ok) {
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

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
