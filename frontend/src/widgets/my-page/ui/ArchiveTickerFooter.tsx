import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

const TICKER_MESSAGE =
  'ANALYSIS_ENGINE_ONLINE :: PERFORMANCE_DATA_SYNCED :: ARCHIVE_INDEX_READY :: SYSTEM STATUS: NOMINAL';
const TICKER_GROUP_COUNT = 2;

export function ArchiveTickerFooter() {
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
        <span>[AI_ARCHIVE]</span>
      </div>

      <div className="min-w-0 flex-1 overflow-hidden border-l border-white/[0.06]">
        <div className="flex h-full w-max min-w-full animate-ticker items-center motion-reduce:animate-none">
          {Array.from({ length: TICKER_GROUP_COUNT }, (_, groupIndex) => (
            <div
              key={groupIndex}
              className="flex min-w-full shrink-0 items-center justify-around gap-16 px-8 text-zinc-600"
              aria-hidden={groupIndex > 0}
            >
              <span className="whitespace-nowrap">{TICKER_MESSAGE}</span>
              <span className="whitespace-nowrap">{TICKER_MESSAGE}</span>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
