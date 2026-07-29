import type { LeaderboardEntry } from '@/entities/performance';

import { RoomPanel } from './RoomPanel';

interface LeaderboardPanelProps {
  entries: LeaderboardEntry[];
}

const rankFormatter = new Intl.NumberFormat('ko-KR', {
  minimumIntegerDigits: 2,
  useGrouping: false,
});

export function LeaderboardPanel({ entries }: LeaderboardPanelProps) {
  return (
    <RoomPanel className="flex min-h-64 flex-1 flex-col overflow-hidden">
      <h2 className="border-b border-white/15 px-4 py-4 font-mono text-sm tracking-[0.08em] text-zinc-300">
        LEADERBOARD ({rankFormatter.format(entries.length)})
      </h2>

      {entries.length === 0 ? (
        <p className="px-4 py-5 text-xs text-zinc-600">아직 부른 노래가 없습니다.</p>
      ) : (
        <ol aria-label="공연 순위">
          {entries.map((entry) => (
            <li
              key={entry.performanceId}
              className="grid grid-cols-[auto_1fr_auto] gap-2 border-b border-white/8 px-4 py-4"
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
