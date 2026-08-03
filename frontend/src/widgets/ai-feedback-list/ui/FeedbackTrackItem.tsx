import { memo } from 'react';
import Link from 'next/link';

import type { FeedbackItem } from '@/entities/feedback';
import { SongThumbnail } from '@/entities/song';
import { cn } from '@/shared/lib/cn';
import { getScoreGrade, GRADE_CLASS } from '@/shared/lib/scoreGrade';

import { formatSingAt } from '../lib/formatSingAt';

function BoltIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-3 shrink-0"
    >
      <path d="M13 2 4.5 13.5H11L9.5 22 19 10.5h-6.5L13 2Z" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

interface FeedbackTrackItemProps {
  item: FeedbackItem;
  /** 전체 목록 기준 순번(0부터) */
  index: number;
}

// 무한 스크롤로 페이지가 쌓여도 기존 항목은 리렌더되지 않도록 memo.
// 캐시된 페이지의 item 참조가 유지되므로 얕은 비교로 충분하다.
export const FeedbackTrackItem = memo(function FeedbackTrackItem({
  item,
  index,
}: FeedbackTrackItemProps) {
  const singAt = formatSingAt(item.singAt);
  const grade = getScoreGrade(item.score);

  return (
    <Link
      href={`/ai-feedback/${item.feedbackId}`}
      className={cn(
        'group relative grid grid-cols-[auto_minmax(0,1.1fr)_8rem_minmax(0,1.4fr)_auto] items-center gap-8 overflow-hidden border border-white/[0.08] bg-[#121214] p-5 pl-6 transition-colors',
        'hover:border-cyan-300/40 hover:bg-[#15151a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300',
      )}
    >
      {/* 액센트 바 */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-cyan-300/70" />

      <SongThumbnail src={item.thumbnail ?? null} className="size-[4.5rem]" />

      <div className="min-w-0">
        <p className="font-mono text-[0.58rem] font-bold tracking-[0.24em] text-fuchsia-400">
          TRACK_{String(index + 1).padStart(2, '0')}
        </p>
        <p className="mt-1.5 truncate font-sans text-xl font-black tracking-tight text-white transition-colors group-hover:text-cyan-200">
          {item.title}
        </p>
        <p className="mt-1 truncate font-mono text-[0.62rem] uppercase tracking-[0.2em] text-zinc-500">
          {item.artist}
        </p>
      </div>

      <div>
        <p className="font-mono text-[0.52rem] font-bold tracking-[0.2em] text-zinc-600">
          TIMESTAMP
        </p>
        {singAt ? (
          <div className="mt-2 font-mono text-[0.7rem] tracking-[0.14em] text-zinc-300">
            <p>{singAt.date}</p>
            <p className="mt-0.5">{singAt.time}</p>
          </div>
        ) : (
          <p className="mt-2 font-mono text-[0.7rem] tracking-[0.14em] text-zinc-600">--</p>
        )}
      </div>

      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-mono text-[0.52rem] font-bold tracking-[0.2em] text-cyan-300">
          <BoltIcon />
          AI_INSIGHT
        </p>
        {item.overall ? (
          <p className="mt-2 line-clamp-2 text-[0.8rem] italic leading-relaxed text-zinc-300">
            &ldquo;{item.overall}&rdquo;
          </p>
        ) : (
          <p className="mt-2 font-mono text-[0.62rem] tracking-[0.14em] text-zinc-600">
            ANALYSIS_PENDING...
          </p>
        )}
      </div>

      <div className="flex items-center gap-4 justify-self-end">
        <div className="text-right">
          <p className="font-mono text-[0.52rem] font-bold tracking-[0.2em] text-zinc-600">
            SCORE
          </p>
          <p className="mt-1 font-sans text-4xl font-black tracking-tight text-white">
            {item.score.toFixed(1)}
          </p>
        </div>
        <span
          className={cn(
            'flex size-10 items-center justify-center border font-mono text-sm font-bold',
            GRADE_CLASS[grade],
          )}
        >
          {grade}
        </span>
        <span
          aria-hidden="true"
          className="text-zinc-700 transition-all group-hover:translate-x-0.5 group-hover:text-cyan-300"
        >
          <ChevronRightIcon />
        </span>
      </div>
    </Link>
  );
});
