import Link from 'next/link';

import type { RecentPerformance } from '@/entities/user';
import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';
import { SettingsPanel } from '@/shared/ui/panel/SettingsPanel';

import { formatPerformedAt } from '../lib/formatters';
import { ChevronRightIcon, HistoryIcon } from './icons';
import { TrackThumbnail } from './TrackThumbnail';

interface RecentActivityCardProps {
  performances: RecentPerformance[];
}

export function RecentActivityCard({ performances }: RecentActivityCardProps) {
  return (
    <SettingsPanel title="RECENT ACTIVITY" icon={<HistoryIcon />}>
      <Link
        href="/ai-feedback"
        className={cn(
          jetBrainsMono.className,
          // SettingsPanel의 콘텐츠 래퍼가 기준점이라 패딩 안쪽 우상단에 붙는다.
          'absolute right-0 top-0 flex items-center gap-1.5 border border-white/10 bg-black/25 px-2.5 py-1.5 text-[0.5rem] font-bold tracking-[0.12em] text-zinc-400 transition-colors',
          'hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300',
        )}
      >
        VIEW_ALL_FEEDBACK
        <ChevronRightIcon />
      </Link>

      {performances.length === 0 ? (
        <p
          className={cn(
            jetBrainsMono.className,
            'py-12 text-center text-[0.55rem] tracking-[0.12em] text-zinc-600',
          )}
        >
          [EMPTY] 아직 공연 기록이 없습니다.
        </p>
      ) : (
        <>
          <div
            className={cn(
              jetBrainsMono.className,
              'mt-7 grid grid-cols-[1fr_5rem_4rem] items-center border-b border-white/[0.07] pb-3 text-[0.5rem] font-bold tracking-[0.16em] text-zinc-600',
            )}
          >
            <span>SONG TRACK</span>
            <span className="text-right">SCORE</span>
            <span className="text-right">GRADE</span>
          </div>

          <ul>
            {performances.map((performance) => {
              const performedAt = formatPerformedAt(performance.performanceAt);

              return (
                <li
                  key={performance.performanceId}
                  className="grid grid-cols-[1fr_5rem_4rem] items-center border-b border-white/[0.04] py-3.5 last:border-b-0"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <TrackThumbnail
                      thumbnailUrl={performance.thumbnailUrl}
                      title={performance.title}
                      size={40}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[0.82rem] font-bold text-zinc-100">
                        {performance.title}
                      </p>
                      {performedAt && (
                        <p
                          className={cn(
                            jetBrainsMono.className,
                            'mt-1 text-[0.5rem] tracking-[0.12em] text-zinc-600',
                          )}
                        >
                          {performedAt}
                        </p>
                      )}
                    </div>
                  </div>

                  <p
                    className={cn(
                      jetBrainsMono.className,
                      'text-right text-[0.82rem] font-bold text-zinc-100',
                    )}
                  >
                    {performance.score.toFixed(1)}
                  </p>

                  {/* GRADE는 점수 구간 기준이 정해지지 않아 자리만 만들어 둔다. */}
                  <div className="flex justify-end">
                    <span
                      className={cn(
                        jetBrainsMono.className,
                        'flex size-7 items-center justify-center border border-white/[0.07] text-[0.6rem] font-bold text-zinc-700',
                      )}
                      title="등급 기준 확정 전"
                    >
                      --
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </SettingsPanel>
  );
}
