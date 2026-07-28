/** 백엔드 GlobalExceptionHandler ErrorResponse */
export interface BackendErrorResponse {
  status?: number;
  code?: string;
  message?: string;
  timestamp?: string;
  /** Spring 기본 validation 오류 등 */
  error?: string;
}

/** REST API error code (BaseErrorCode.name()) */
export const API_ERROR_CODE = {
  // Auth
  ALREADY_REGISTERED: 'ALREADY_REGISTERED',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  REFRESH_TOKEN_ALREADY_USED: 'REFRESH_TOKEN_ALREADY_USED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_SIGNUP_TOKEN: 'INVALID_SIGNUP_TOKEN',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // User
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  NICKNAME_REQUIRED: 'NICKNAME_REQUIRED',

  // Room
  ROOM_CLOSED: 'ROOM_CLOSED',
  ROOM_NOT_JOINABLE: 'ROOM_NOT_JOINABLE',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_NOT_READY_FOR_PERFORMANCE: 'ROOM_NOT_READY_FOR_PERFORMANCE',
  ROOM_NOT_PLAYING: 'ROOM_NOT_PLAYING',
  REENTRY_BANNED: 'REENTRY_BANNED',
  PARTICIPANT_NOT_ACTIVE: 'PARTICIPANT_NOT_ACTIVE',
  PARTICIPANT_MUST_BE_ONLINE: 'PARTICIPANT_MUST_BE_ONLINE',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  PARTICIPANT_NOT_FOUND: 'PARTICIPANT_NOT_FOUND',
  ALREADY_JOINED: 'ALREADY_JOINED',
  ALREADY_IN_ANOTHER_ROOM: 'ALREADY_IN_ANOTHER_ROOM',
  HOST_ONLY: 'HOST_ONLY',

  // Song
  SONG_NOT_FOUND: 'SONG_NOT_FOUND',

  // Common
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE] | string;

export interface ParsedApiErrorBody {
  message: string;
  code?: string;
  status: number;
}

const FRONTEND_ERROR_MESSAGES: Partial<Record<string, string>> = {
  [API_ERROR_CODE.INTERNAL_SERVER_ERROR]:
    '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
};

export async function parseErrorResponse(response: Response): Promise<ParsedApiErrorBody> {
  const fallbackMessage = '요청에 실패했습니다.';
  let message = fallbackMessage;
  let code: string | undefined;

  try {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const errorBody = (await response.json()) as BackendErrorResponse;
      code = errorBody.code;
      message = errorBody.message ?? errorBody.error ?? fallbackMessage;
    } else {
      const errorText = (await response.text()).trim();
      if (errorText) {
        message = errorText;
      }
    }
  } catch {
    // ignore parse errors
  }

  return {
    message,
    code,
    status: response.status,
  };
}

export function resolveApiErrorMessage(
  message: string,
  code?: string,
  fallback = '요청에 실패했습니다.',
): string {
  if (code && FRONTEND_ERROR_MESSAGES[code]) {
    return FRONTEND_ERROR_MESSAGES[code]!;
  }

  return message || fallback;
}
