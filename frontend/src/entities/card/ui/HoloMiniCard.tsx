import { cn } from '@/shared/lib/cn';

import { CARD_ASPECT, CARD_RADIUS } from '../config/cardVisuals';
import { StarCubeIcon } from './CardIcons';

interface HoloMiniCardProps {
  className?: string;
  /** true면 사용 완료 상태(회색 탈색) */
  used?: boolean;
  /** 호버·대기 애니메이션 (캠 독 트리거용). 목록 축소 표시에는 끈다. */
  interactive?: boolean;
}

/**
 * 참가자 캠 모서리에 표시하는 카드 보유 상태 미니 카드.
 * TCG 실물 비율·모서리를 따르며, 대기 중은 어두운 면 + 시안 포인트로 표시한다.
 */
export function HoloMiniCard({
  className,
  used = false,
  interactive = false,
}: HoloMiniCardProps) {
  return (
    <div
      className={cn(
        'relative w-10 select-none overflow-hidden border transition-[transform,border-color,box-shadow] duration-200 ease-out',
        used
          ? 'border-zinc-600 bg-zinc-800'
          : 'border-cyan-300/50 bg-[#1a1a1e]',
        interactive && !used && 'animate-mini-card-pulse group-hover:scale-110 group-hover:border-cyan-200 group-active:scale-95',
        interactive && used && 'group-hover:scale-105 group-active:scale-95',
        className,
      )}
      style={{
        aspectRatio: CARD_ASPECT,
        borderRadius: CARD_RADIUS,
        // interactive 대기는 CSS pulse 애니메이션이 box-shadow를 맡는다.
        boxShadow:
          used || interactive ? undefined : '0 0 0 1px rgb(34 211 238 / 12%)',
      }}
    >
      <div
        className={cn(
          'absolute inset-0 opacity-80 transition-opacity duration-200',
          used
            ? 'bg-gradient-to-br from-zinc-700/40 to-zinc-900/80'
            : 'bg-gradient-to-br from-cyan-950/50 via-transparent to-zinc-900/60',
          interactive && !used && 'group-hover:opacity-100',
        )}
      />

      {/* 대각선 빛 스윕 — 무지개가 아니라 시안 하이라이트만 */}
      {interactive && !used ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ borderRadius: CARD_RADIUS }}
        >
          <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-cyan-200/35 to-transparent animate-mini-card-sheen group-hover:[animation-duration:1.4s]" />
        </div>
      ) : null}

      <div className="relative grid size-full place-items-center">
        <StarCubeIcon
          className={cn(
            'size-4 transition-transform duration-200 ease-out',
            used ? 'text-zinc-500' : 'text-cyan-200/80',
            interactive && !used && 'group-hover:scale-110 group-hover:text-cyan-100',
          )}
        />
      </div>
    </div>
  );
}
