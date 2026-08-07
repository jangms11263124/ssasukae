import { cn } from '@/shared/lib/cn';

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-label="방장"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn('size-3 shrink-0 text-amber-300 drop-shadow-[0_0_6px_rgba(252,211,77,0.55)]', className)}
    >
      <path d="M4 8l4 3.5L12 6l4 5.5L20 8l-1.6 9.5H5.6L4 8z" />
    </svg>
  );
}

export interface StageIdentity {
  isHost?: boolean;
  isMe?: boolean;
  isPerformer?: boolean;
  nickname: string;
}

interface StageIdentityBadgeProps {
  identity: StageIdentity;
  /** 스테이지 하단용 / 타일용 */
  size?: 'sm' | 'md';
}

/** 닉네임 + 방장 왕관(+ LIVE / 나)을 작게 표시 */
export function StageIdentityBadge({ identity, size = 'md' }: StageIdentityBadgeProps) {
  const { isHost = false, isMe = false, isPerformer = false, nickname } = identity;

  return (
    <div
      className={cn(
        // 영상 위 가독성용 연한 검정 박스만 남긴다(테두리 제거). 도트는 사용자 요청으로 뺐다 — 헤더 모드 표시에만 쓴다
        'inline-flex max-w-full items-center gap-1.5 rounded-sm bg-black/60 text-zinc-100 backdrop-blur-sm',
        size === 'md' ? 'px-2.5 py-1' : 'px-2 py-0.5',
      )}
    >
      {isHost ? <CrownIcon className={size === 'md' ? 'size-3' : 'size-2.5'} /> : null}
      <span
        className={cn(
          // 한글은 어센트가 커서 상자 중앙보다 1px 떠 보인다 — 초대코드 복사 버튼과 같은 광학 보정
          'translate-y-px truncate font-medium',
          size === 'md' ? 'text-xs' : 'text-[10px]',
        )}
      >
        {nickname}
        {isMe ? ' (나)' : ''}
      </span>
      {isPerformer ? (
        <span className="shrink-0 font-mono text-[9px] tracking-wider text-cyan-300">LIVE</span>
      ) : null}
    </div>
  );
}
