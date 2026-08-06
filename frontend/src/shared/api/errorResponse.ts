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
  REFRESH_TOKEN_REQUIRED: 'REFRESH_TOKEN_REQUIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_SIGNUP_TOKEN: 'INVALID_SIGNUP_TOKEN',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // User
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  NICKNAME_REQUIRED: 'NICKNAME_REQUIRED',
  NICKNAME_DUPLICATED: 'NICKNAME_DUPLICATED',

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
  INVITE_CODE_GENERATION_FAILED: 'INVITE_CODE_GENERATION_FAILED',
  MEDIA_SESSION_OPERATION_FAILED: 'MEDIA_SESSION_OPERATION_FAILED',

  // Song
  SONG_NOT_FOUND: 'SONG_NOT_FOUND',
  UNSUPPORTED_SEARCH_FILTER: 'UNSUPPORTED_SEARCH_FILTER',

  // Favorite
  FAVORITE_NOT_FOUND: 'FAVORITE_NOT_FOUND',

  // Common
  INVALID_REQUEST: 'INVALID_REQUEST',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE] | string;

export interface ParsedApiErrorBody {
  message: string;
  code?: string;
  status: number;
}

export const DEFAULT_ERROR_MESSAGE = '잠시 후 다시 시도해 주세요.';

const RELOGIN_MESSAGE = '로그인이 만료됐어요. 다시 로그인해 주세요.';

/**
 * 사용자에게 보여줄 문구는 프론트가 갖는다.
 * 서버 원문은 내부 용어(refresh token 등)를 담고 있고 말투도 달라서 그대로 쓰지 않는다.
 */
const FRONTEND_ERROR_MESSAGES: Partial<Record<string, string>> = {
  // Auth
  [API_ERROR_CODE.ALREADY_REGISTERED]: '이미 가입된 계정이에요. 로그인해 주세요.',
  [API_ERROR_CODE.INVALID_TOKEN]: RELOGIN_MESSAGE,
  [API_ERROR_CODE.INVALID_REFRESH_TOKEN]: RELOGIN_MESSAGE,
  [API_ERROR_CODE.REFRESH_TOKEN_ALREADY_USED]: RELOGIN_MESSAGE,
  [API_ERROR_CODE.REFRESH_TOKEN_REQUIRED]: '로그인이 필요해요.',
  [API_ERROR_CODE.SESSION_EXPIRED]:
    '다른 기기에서 로그인했어요. 다시 로그인해 주세요.',
  [API_ERROR_CODE.INVALID_SIGNUP_TOKEN]: '회원가입을 다시 시작해 주세요.',

  // User
  [API_ERROR_CODE.USER_NOT_FOUND]: '사용자를 찾을 수 없어요.',
  [API_ERROR_CODE.NICKNAME_REQUIRED]: '닉네임을 입력해 주세요.',
  [API_ERROR_CODE.NICKNAME_DUPLICATED]: '이미 사용 중인 닉네임이에요.',

  // Room
  [API_ERROR_CODE.ROOM_CLOSED]: '이미 종료된 방이에요.',
  [API_ERROR_CODE.ROOM_NOT_JOINABLE]: '지금은 입장할 수 없는 방이에요.',
  [API_ERROR_CODE.ROOM_FULL]: '방이 가득 찼어요.',
  [API_ERROR_CODE.ROOM_NOT_READY_FOR_PERFORMANCE]: '아직 공연을 시작할 수 없어요.',
  [API_ERROR_CODE.ROOM_NOT_PLAYING]: '공연 중이 아니에요.',
  [API_ERROR_CODE.REENTRY_BANNED]: '강퇴된 방에는 다시 입장할 수 없어요.',
  [API_ERROR_CODE.PARTICIPANT_NOT_ACTIVE]: '이미 방에서 나간 참가자예요.',
  [API_ERROR_CODE.PARTICIPANT_MUST_BE_ONLINE]: '접속 중인 참가자만 선택할 수 있어요.',
  [API_ERROR_CODE.ROOM_NOT_FOUND]: '존재하지 않는 방이에요.',
  [API_ERROR_CODE.PARTICIPANT_NOT_FOUND]: '참가자를 찾을 수 없어요.',
  [API_ERROR_CODE.ALREADY_JOINED]: '이미 참가 중인 방이에요.',
  [API_ERROR_CODE.ALREADY_IN_ANOTHER_ROOM]: '다른 방에 참여 중이에요. 먼저 나와 주세요.',
  [API_ERROR_CODE.HOST_ONLY]: '방장만 할 수 있어요.',
  [API_ERROR_CODE.INVITE_CODE_GENERATION_FAILED]: '잠시 후 다시 시도해 주세요.',
  [API_ERROR_CODE.MEDIA_SESSION_OPERATION_FAILED]:
    '화상 연결에 문제가 생겼어요. 다시 시도해 주세요.',

  // Song
  [API_ERROR_CODE.SONG_NOT_FOUND]: '존재하지 않는 곡이에요.',
  [API_ERROR_CODE.UNSUPPORTED_SEARCH_FILTER]: '지원하지 않는 검색 조건이에요.',

  // Favorite
  [API_ERROR_CODE.FAVORITE_NOT_FOUND]: '찜 정보를 찾을 수 없어요.',

  // Common
  [API_ERROR_CODE.INVALID_REQUEST]: '입력한 내용을 다시 확인해 주세요.',
  [API_ERROR_CODE.INTERNAL_SERVER_ERROR]:
    '일시적인 오류가 생겼어요. 잠시 후 다시 시도해 주세요.',
};

/** 사용자에게 보여줄 수 없는 내부 용어 (토큰·스택·프레임워크 메시지·디버그 정보 등) */
const INTERNAL_TERM_PATTERN =
  /token|jwt|bearer|session id|exception|stack|null|undefined|\bat\s|<[a-z/!]|[{}]|websocket|stomp|http[s]?:\/\/|\S+=\S|토큰|쿠키|헤더|파싱|세션/i;

const HANGUL_PATTERN = /[가-힣]/;
const MAX_USER_FACING_LENGTH = 120;

/**
 * 사용자에게 그대로 노출해도 되는 문구인지 판단한다.
 * 서버의 사용자용 메시지는 모두 한글이라, 한글이 없으면 내부 메시지로 본다.
 */
function isUserFacingMessage(message: string): boolean {
  const trimmed = message.trim();

  if (trimmed === '' || trimmed.length > MAX_USER_FACING_LENGTH) {
    return false;
  }

  return HANGUL_PATTERN.test(trimmed) && !INTERNAL_TERM_PATTERN.test(trimmed);
}

export async function parseErrorResponse(response: Response): Promise<ParsedApiErrorBody> {
  const fallbackMessage = DEFAULT_ERROR_MESSAGE;
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
  fallback = DEFAULT_ERROR_MESSAGE,
): string {
  if (code && FRONTEND_ERROR_MESSAGES[code]) {
    return FRONTEND_ERROR_MESSAGES[code]!;
  }

  return isUserFacingMessage(message) ? message : fallback;
}

/** API 응답이 아닌 문구(WebSocket 이벤트, 브라우저 오류 등)를 토스트에 쓸 때 사용한다. */
export function toUserFacingMessage(
  message: string | null | undefined,
  fallback: string,
): string {
  return message && isUserFacingMessage(message) ? message : fallback;
}

/**
 * WebSocket 에러 코드(WebSocketErrorCode)별 사용자 문구.
 * 서버 원문은 격식체이고 디버그 정보가 붙어 올 수 있어 그대로 쓰지 않는다.
 */
const WS_ERROR_MESSAGES: Partial<Record<string, string>> = {
  // 인증
  UNAUTHORIZED: RELOGIN_MESSAGE,
  TOKEN_EXPIRED: RELOGIN_MESSAGE,

  // 공통
  INVALID_REQUEST: '요청을 처리하지 못했어요. 다시 시도해 주세요.',
  RESOURCE_NOT_FOUND: '요청한 정보를 찾을 수 없어요.',
  DUPLICATE_REQUEST: '이미 처리된 요청이에요.',
  ACTION_NOT_ALLOWED: '권한이 없어서 할 수 없어요.',

  // 방
  INVALID_ROOM_STATE: '지금은 할 수 없는 동작이에요.',
  ROOM_ACCESS_DENIED: '이 방의 참가자만 할 수 있어요.',

  // 공연
  INVALID_PERFORMANCE_STATE: '지금 공연 상태에서는 할 수 없는 동작이에요.',
  INVALID_PERFORMANCE_SETTING: '설정값이 허용 범위를 벗어났어요.',
  PERFORMANCE_ROOM_MISMATCH: '공연 정보가 맞지 않아요. 새로고침해 주세요.',
  PERFORMANCE_ALREADY_IN_PROGRESS: '이미 진행 중인 공연이 있어요.',
  PERFORMANCE_RESOURCE_NOT_READY: '아직 공연 준비가 안 끝났어요. 잠시 후 다시 시도해 주세요.',
  DOWNLOAD_URL_GENERATION_FAILED: '곡을 불러오지 못했어요. 다시 시도해 주세요.',
  PERFORMER_PERMISSION_REQUIRED: '가창자만 할 수 있어요.',

  // 카드 (수성전)
  INVALID_ROOM_MODE: '수성전에서만 카드를 쓸 수 있어요.',
  NO_ACTIVE_PERFORMANCE: '진행 중인 공연이 없어요.',
  PERFORMANCE_MISMATCH: '공연 정보가 맞지 않아요. 새로고침해 주세요.',
  NO_ACTIVE_PERFORMER: '카드를 쓸 대상이 없어요.',
  PLAYBACK_NOT_RUNNING: '노래가 나오는 동안에만 카드를 쓸 수 있어요.',
  INSUFFICIENT_PLAYBACK_TIME: '노래가 곧 끝나서 카드를 쓸 수 없어요.',
  PARTICIPANT_NOT_ACTIVE: '지금은 카드를 쓸 수 없는 상태예요.',
  PARTICIPANT_OFFLINE: '연결이 불안정해서 카드를 쓸 수 없어요.',
  PERFORMER_CANNOT_USE_CARD: '가창자는 카드를 쓸 수 없어요.',
  CARD_NOT_FOUND: '가지고 있지 않은 카드예요.',
  CARD_ASSIGNMENT_NOT_FOUND: '가지고 있지 않은 카드예요.',
  CARD_NOT_ASSIGNED: '가지고 있지 않은 카드예요.',
  CARD_ALREADY_USED: '이미 사용한 카드예요.',
  CARD_ALREADY_PENDING: '이미 발동을 기다리고 있는 카드예요.',
  INVALID_CARD_STATE: '지금은 쓸 수 없는 카드예요.',
  CARD_CONFIGURATION_INVALID: '카드를 사용하지 못했어요. 다시 시도해 주세요.',
  CARD_ACTIVATION_PENDING: '다른 카드가 발동을 기다리고 있어요. 잠시 후 다시 써 주세요.',
  CARD_EFFECT_ALREADY_ACTIVE: '다른 카드 효과가 적용되는 중이에요.',
  CARD_STATE_CONFLICT: '카드 상태가 바뀌었어요. 다시 시도해 주세요.',
  INVALID_CARD_TARGET: '카드를 쓸 대상을 찾지 못했어요.',

  // 서버 내부 오류
  INTERNAL_SERVER_ERROR: '일시적인 오류가 생겼어요. 잠시 후 다시 시도해 주세요.',
};

/** WebSocket 에러 이벤트(/user/queue/errors)를 토스트 문구로 바꾼다. */
export function resolveWsErrorMessage(
  errorCode: string | null | undefined,
  message: string | null | undefined,
  fallback: string,
): string {
  if (errorCode && WS_ERROR_MESSAGES[errorCode]) {
    return WS_ERROR_MESSAGES[errorCode]!;
  }

  return toUserFacingMessage(message, fallback);
}
