import { ApiError } from '@/shared/api/client';
import { API_ERROR_CODE } from '@/shared/api/errorResponse';
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';

/**
 * 초대 코드 입장 실패 사유 안내 문구.
 * 공통 문구(FRONTEND_ERROR_MESSAGES)만으로는 사유가 드러나지 않는 코드를
 * 입장 문맥에 맞게 덮어쓴다. 나머지 코드는 공통 문구를 그대로 쓴다.
 */
const JOIN_ERROR_MESSAGES: Partial<Record<string, string>> = {
  // 초대 코드 입장은 방이 공연 준비 상태일 때만 허용되므로, NOT_JOINABLE은 곧 공연 진행 중이다.
  [API_ERROR_CODE.ROOM_NOT_JOINABLE]: '공연이 진행 중인 방이에요.',
  [API_ERROR_CODE.ROOM_NOT_FOUND]: '초대 코드와 일치하는 방이 없어요.',
};

export function resolveJoinErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code) {
    const joinMessage = JOIN_ERROR_MESSAGES[error.code];
    if (joinMessage) {
      return joinMessage;
    }
  }

  return getApiErrorMessage(error, '방에 입장하지 못했어요.');
}
