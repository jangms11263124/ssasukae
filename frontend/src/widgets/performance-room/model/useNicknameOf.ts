'use client';

import { useRoomStore } from '@/entities/room';

/**
 * participantId → 닉네임 조회기. 카드 연출(카운트다운·컷인·배너)이 모두
 * 같은 방식으로 공격자·대상 이름을 찾으므로 한 곳에 둔다.
 */
export function useNicknameOf(): (participantId: number) => string {
  const participants = useRoomStore((state) => state.participants);

  return (participantId) =>
    participants.find(({ id }) => id === participantId)?.nickname ?? '???';
}
