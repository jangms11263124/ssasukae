import type { ReactNode } from 'react';

import { CARD_ASPECT, CARD_RADIUS } from '@/entities/card';
import { cn } from '@/shared/lib/cn';

import { CardSheen } from './CardSheen';
import { UsedStamp } from './UsedStamp';

interface UnknownCardFaceProps {
  className?: string;
  used?: boolean;
  /** 카드 한가운데 글자. 기본은 물음표 */
  mark?: ReactNode;
  /** mark의 크기(카드 폭 대비 %). 글자가 길면 줄여 준다 */
  markSizeCqw?: number;
}

/**
 * 정체를 모르는 카드 면. 다른 참가자의 카드는 발동 전까지 내용도 등급도 알 수 없어
 * 정식 뒷면(등급 표기 포함) 대신 캠 옆 미니 카드와 같은 결의 물음표 면을 쓴다.
 * 물음표는 컨테이너 폭에 비례해(cqw) 어느 크기에서든 같은 비율로 보인다.
 */
export function UnknownCardFace({
  className,
  used = false,
  mark,
  markSizeCqw = 32,
}: UnknownCardFaceProps) {
  return (
    <div
      className={cn(
        'relative select-none overflow-hidden border transition-colors duration-500',
        // 사용된 카드는 색을 빼 '지나간 카드'로 보이게 한다 (광택도 함께 멎는다).
        // 배경보다는 밝게 — 어두운 방 배경에 묻히면 카드가 사라진 것처럼 보인다.
        used ? 'border-zinc-500/70 bg-zinc-800' : 'border-cyan-300/50 bg-[#1a1a1e]',
        className,
      )}
      style={{ aspectRatio: CARD_ASPECT, borderRadius: CARD_RADIUS, containerType: 'inline-size' }}
    >
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 opacity-80 transition-opacity duration-500',
          used
            ? 'bg-gradient-to-br from-zinc-600/40 to-zinc-800/80'
            : 'bg-gradient-to-br from-cyan-950/50 via-transparent to-zinc-900/60',
        )}
      />

      {/* 내 카드(CompactCardFace)와 같은 시계를 쓰는 광택 — 화면의 카드가 함께 반짝인다 */}
      {used ? null : <CardSheen color="rgb(165 243 252 / 35%)" />}

      <div className="relative grid size-full place-items-center">
        <span
          className={cn(
            'font-mono font-black',
            // 다 쓴 카드도 물음표 면은 그대로 두고 색만 뺀다 — 도장은 그 위에 얹는다.
            used
              ? 'text-zinc-600/70'
              : 'text-cyan-200/90 drop-shadow-[0_0_24px_rgba(34,211,238,0.55)]',
          )}
          style={{ fontSize: `${markSizeCqw}cqw`, lineHeight: 1 }}
        >
          {mark ?? '?'}
        </span>
      </div>

      {used ? <UsedStamp /> : null}
    </div>
  );
}
