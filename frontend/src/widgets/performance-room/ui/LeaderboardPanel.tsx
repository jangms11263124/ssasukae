import type { LeaderboardEntry } from '@/entities/performance';

import { cn } from '@/shared/lib/cn';

import { RoomPanel } from './RoomPanel';

interface LeaderboardPanelProps {
  compact?: boolean;
  entries: LeaderboardEntry[];
}

/** 1~3위는 금/은/동 배지로 구분한다. */
const TOP_RANK_BADGE: Record<number, string> = {
  1: 'border-amber-300/60 bg-amber-300/15 text-amber-200',
  2: 'border-zinc-300/45 bg-zinc-300/10 text-zinc-100',
  3: 'border-orange-400/50 bg-orange-400/10 text-orange-300',
};

const countFormatter = new Intl.NumberFormat('ko-KR', {
  minimumIntegerDigits: 2,
  useGrouping: false,
});

function LeaderboardRow({ compact, entry }: { compact?: boolean; entry: LeaderboardEntry }) {
  const topBadge = TOP_RANK_BADGE[entry.rank];

  return (
    <li
      className={cn(
        'grid grid-cols-[auto_1fr_auto] items-center gap-2.5 border-b border-white/8 px-4 py-3',
        compact && 'last:border-b-0',
        entry.rank === 1 &&
          'bg-gradient-to-r from-amber-300/[0.08] via-amber-300/[0.02] to-transparent',
      )}
    >
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]',
          topBadge ?? 'border-white/10 text-zinc-500',
        )}
      >
        <span aria-hidden>{entry.rank}</span>
        <span className="sr-only">{entry.rank}위</span>
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-200">{entry.songTitle}</p>
        <p className={cn('truncate text-[10px] text-zinc-500', compact ? 'mt-0.5' : 'mt-1')}>
          {compact ? entry.nickname : `${entry.nickname} 님이 불렀습니다`}
        </p>
      </div>
      <span className="flex items-baseline gap-0.5 font-mono">
        <strong
          className={cn('text-sm', entry.rank === 1 ? 'text-amber-200' : 'text-cyan-300')}
        >
          {Math.round(entry.finalScore)}
        </strong>
        <span className="text-[10px] text-zinc-500">점</span>
      </span>
    </li>
  );
}

export function LeaderboardPanel({ compact = false, entries }: LeaderboardPanelProps) {
  if (compact) {
    if (entries.length === 0) {
      return <p className="px-4 py-4 text-xs text-zinc-600">아직 부른 노래가 없습니다.</p>;
    }

    return (
      <ol aria-label="공연 순위">
        {entries.map((entry) => (
          <LeaderboardRow key={entry.performanceId} compact entry={entry} />
        ))}
      </ol>
    );
  }

  return (
    <RoomPanel className="flex h-full min-h-0 flex-col overflow-hidden">
      <h2 className="shrink-0 border-b border-white/15 px-4 py-3 font-mono text-sm tracking-[0.08em] text-zinc-300">
        LEADERBOARD ({countFormatter.format(entries.length)})
      </h2>

      {entries.length === 0 ? (
        <p className="px-4 py-4 text-xs text-zinc-600">아직 부른 노래가 없습니다.</p>
      ) : (
        <ol
          aria-label="공연 순위"
          className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {entries.map((entry) => (
            <LeaderboardRow key={entry.performanceId} entry={entry} />
          ))}
        </ol>
      )}
    </RoomPanel>
  );
}
