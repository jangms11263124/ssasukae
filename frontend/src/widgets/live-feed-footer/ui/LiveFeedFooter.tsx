import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

import { LIVE_FEED_COPY } from '../config/liveFeedCopy';
import { ChorusInviteButton } from './ChorusInviteButton';

// 애니메이션이 -50% 이동으로 이어지므로 그룹을 2벌 렌더링해야 끊김 없이 돈다.
const TICKER_GROUP_COUNT = 2;

interface LiveFeedFooterProps {
  className?: string;
}

/** 게임방 밖의 모든 화면 하단에 고정으로 붙는 라이브 피드 푸터. */
export function LiveFeedFooter({ className }: LiveFeedFooterProps) {
  return (
    <footer
      className={cn(
        jetBrainsMono.className,
        'relative z-20 flex h-10 shrink-0 items-stretch border-t border-white/[0.06] bg-[#090909] text-xs tracking-[0.08em]',
        className,
      )}
      aria-label="라이브 피드"
    >
      <div className="flex shrink-0 items-center gap-2.5 px-5 text-neon-cyan sm:px-8">
        <span className="h-2.5 w-2.5 rounded-full bg-neon-cyan" aria-hidden="true" />
        <span>{LIVE_FEED_COPY.label}</span>
      </div>

      <div className="min-w-0 flex-1 overflow-hidden border-x border-white/[0.06]">
        <div className="flex h-full w-max min-w-full animate-ticker items-center motion-reduce:animate-none">
          {Array.from({ length: TICKER_GROUP_COUNT }, (_, groupIndex) => (
            <div
              key={groupIndex}
              className="flex min-w-full shrink-0 items-center justify-around gap-16 px-8 text-zinc-400"
              aria-hidden={groupIndex > 0}
            >
              <span className="whitespace-nowrap">{LIVE_FEED_COPY.message}</span>
              <span className="whitespace-nowrap">{LIVE_FEED_COPY.message}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4 px-3 sm:px-5">
        <ChorusInviteButton />
        <span className="hidden text-neon-cyan lg:inline">
          TERMINAL ID: {LIVE_FEED_COPY.terminalId}
        </span>
      </div>
    </footer>
  );
}
