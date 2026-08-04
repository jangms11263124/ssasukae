import type { LeaderboardEntry } from '@/entities/performance';

import { RoomPanel } from './RoomPanel';

interface LeaderboardPanelProps {
  compact?: boolean;
  entries: LeaderboardEntry[];
}

const rankFormatter = new Intl.NumberFormat('ko-KR', {
  minimumIntegerDigits: 2,
  useGrouping: false,
});

export function LeaderboardPanel({ compact = false, entries }: LeaderboardPanelProps) {
  if (compact) {
    if (entries.length === 0) {
      return <p className="px-4 py-4 text-xs text-zinc-600">아직 부른 노래가 없습니다.</p>;
    }

    return (
      <ol aria-label="공연 순위">
        {entries.map((entry) => (
          <li
            key={entry.performanceId}
            className="grid grid-cols-[auto_1fr_auto] gap-2 border-b border-white/8 px-4 py-3 last:border-b-0"
          >
            <span className="pt-0.5 font-mono text-xs text-zinc-600">
              {rankFormatter.format(entry.rank)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-200">{entry.songTitle}</p>
              <p className="mt-0.5 truncate text-[10px] text-zinc-500">{entry.nickname}</p>
            </div>
            <strong className="pt-0.5 font-mono text-sm text-cyan-300">
              {Math.round(entry.finalScore)}
            </strong>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <RoomPanel className="flex h-full min-h-0 flex-col overflow-hidden">
      <h2 className="shrink-0 border-b border-white/15 px-4 py-3 font-mono text-sm tracking-[0.08em] text-zinc-300">
        LEADERBOARD ({rankFormatter.format(entries.length)})
      </h2>

      {entries.length === 0 ? (
        <p className="px-4 py-4 text-xs text-zinc-600">아직 부른 노래가 없습니다.</p>
      ) : (
        <ol
          aria-label="공연 순위"
          className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {entries.map((entry) => (
            <li
              key={entry.performanceId}
              className="grid grid-cols-[auto_1fr_auto] gap-2 border-b border-white/8 px-4 py-3"
            >
              <span className="pt-0.5 font-mono text-xs text-zinc-600">
                {rankFormatter.format(entry.rank)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-200">{entry.songTitle}</p>
                <p className="mt-1 truncate text-[10px] text-zinc-500">
                  {entry.nickname} 님이 불렀습니다
                </p>
              </div>
              <strong className="pt-0.5 font-mono text-sm text-cyan-300">
                {Math.round(entry.finalScore)}
              </strong>
            </li>
          ))}
        </ol>
      )}
    </RoomPanel>
  );
}
