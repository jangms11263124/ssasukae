import { reissueMediaToken } from '@/entities/room';

/** roomId당 동시에 하나의 토큰 요청만 나가도록 한다 (Strict Mode 이중 마운트 대비) */
const tokenInflight = new Map<number, Promise<string>>();

export function fetchMediaToken(roomId: number): Promise<string> {
  const existing = tokenInflight.get(roomId);
  if (existing) {
    return existing;
  }

  const promise = reissueMediaToken(roomId)
    .then((response) => response.openviduToken)
    .finally(() => {
      tokenInflight.delete(roomId);
    });

  tokenInflight.set(roomId, promise);
  return promise;
}
