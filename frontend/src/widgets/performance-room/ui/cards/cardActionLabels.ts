import type { CardAssignmentStatus } from '@/entities/card';

import type { StagePhase } from '../../model/stageStore';

/** 카드 상태 뱃지 문구 (캠 독·레일 카드 공용) */
export function resolveCardStatusLabel(
  status: CardAssignmentStatus | null,
  roomCardBusy: boolean,
): string {
  if (status === 'USED') return 'USED';
  if (status === 'PENDING') return 'ACTIVATING...';
  return roomCardBusy ? 'WAIT' : 'READY';
}

/** 사용 버튼 문구. 사용할 수 없을 때는 버튼 라벨로 이유를 알려준다 — 눌러도 안 되는 이유가 보여야 한다 */
export function resolveCardActionLabel(
  status: CardAssignmentStatus | null,
  phase: StagePhase,
  roomCardBusy: boolean,
): string {
  if (status === 'USED') return '사용 완료';
  if (status === 'PENDING') return '발동 중...';
  if (phase !== 'PERFORMING') return '공연 중에만 사용';
  if (roomCardBusy) return '다른 카드 진행 중';
  return '사용하기';
}
