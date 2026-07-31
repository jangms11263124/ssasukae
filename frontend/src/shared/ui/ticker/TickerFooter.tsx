import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

// 애니메이션이 -50% 이동으로 이어지므로 그룹을 2벌 렌더링해야 끊김 없이 돈다.
const TICKER_GROUP_COUNT = 2;

interface TickerFooterProps {
  /** 왼쪽 고정 라벨. 예: "[AI_ARCHIVE]" */
  label: string;
  /** 흐르는 메시지 한 줄 */
  message: string;
}

/** 페이지 하단의 시스템 상태 티커. 페이지별 위젯이 라벨·문구만 넣어 감싼다. */
export function TickerFooter({ label, message }: TickerFooterProps) {
  return (
    <footer
      className={cn(
        jetBrainsMono.className,
        'relative z-20 flex h-10 shrink-0 items-stretch border-t border-white/[0.06] bg-[#090909] text-[0.5rem] tracking-[0.12em]',
      )}
      aria-label="시스템 상태 피드"
    >
      <div className="flex shrink-0 items-center gap-2.5 px-5 text-cyan-400 sm:px-8">
        <span className="size-1.5 rounded-full bg-cyan-400" aria-hidden="true" />
        <span>{label}</span>
      </div>

      <div className="min-w-0 flex-1 overflow-hidden border-l border-white/[0.06]">
        <div className="flex h-full w-max min-w-full animate-ticker items-center motion-reduce:animate-none">
          {Array.from({ length: TICKER_GROUP_COUNT }, (_, groupIndex) => (
            <div
              key={groupIndex}
              className="flex min-w-full shrink-0 items-center justify-around gap-16 px-8 text-zinc-600"
              aria-hidden={groupIndex > 0}
            >
              <span className="whitespace-nowrap">{message}</span>
              <span className="whitespace-nowrap">{message}</span>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
