'use client';

import { usePerformanceStat } from '@/entities/user';
import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';
import { SettingsPanel } from '@/shared/ui/panel/SettingsPanel';
import { Skeleton } from '@/shared/ui/skeleton/Skeleton';

import { getScoreGrade, GRADE_CLASS, NO_SCORE_LABEL } from '@/shared/lib/scoreGrade';

import { formatCount, formatUpdatedAt } from '../lib/formatters';
import { ChartIcon, RefreshIcon } from './icons';

const EMPTY_VALUE = '--';

type Tone = 'cyan' | 'fuchsia' | 'muted';

const CAPTION_TONE_CLASS: Record<Tone, string> = {
  cyan: 'text-cyan-400',
  fuchsia: 'text-fuchsia-400',
  muted: 'text-zinc-600',
};

interface StatColumnProps {
  label: string;
  value: string;
  /** 값 아래 보조 라벨. 세 칸의 높이를 맞추기 위해 항상 자리를 차지한다. */
  caption: string;
  captionTone: Tone;
  /** 값 강조색. 없으면 중립색. */
  valueClassName?: string;
  /** 첫 조회 중이면 값 자리를 스켈레톤으로 채운다. */
  isLoading?: boolean;
}

function StatColumn({
  label,
  value,
  caption,
  captionTone,
  valueClassName,
  isLoading = false,
}: StatColumnProps) {
  return (
    <div className="px-5 first:pl-0 last:pr-0">
      <p className="text-[0.58rem] font-bold tracking-[0.16em] text-zinc-500">{label}</p>
      {isLoading ? (
        // text-xl 한 줄과 같은 높이로 잡아, 값이 들어올 때 칸이 밀리지 않게 한다.
        <Skeleton tone="strong" className="mt-3.5 h-5 w-14" />
      ) : (
        <p
          className={cn(
            jetBrainsMono.className,
            'mt-3 text-xl font-bold',
            valueClassName ?? 'text-zinc-100',
          )}
        >
          {value}
        </p>
      )}
      <p
        className={cn(
          jetBrainsMono.className,
          'mt-2 text-[0.5rem] font-bold tracking-[0.12em]',
          CAPTION_TONE_CLASS[captionTone],
        )}
      >
        {caption}
      </p>
    </div>
  );
}

/** 증감은 부호에 따라 색을 나눈다. 값이 없으면 색을 빼서 아직 안 불러온 상태로 읽히게 한다. */
function getDifferenceTone(difference: number | undefined): Tone {
  if (difference === undefined || difference === 0) {
    return 'muted';
  }

  return difference > 0 ? 'cyan' : 'fuchsia';
}

export function PerformanceStatusCard() {
  const { stat, refresh, isFetching, isError } = usePerformanceStat();

  const hasStat = stat !== undefined;
  // 재조회 때는 기존 값을 유지하고, 값이 아예 없는 첫 조회만 스켈레톤으로 덮는다.
  const isInitialLoading = isFetching && !hasStat;
  const difference = stat?.difference;
  const differenceCaption =
    difference === undefined
      ? EMPTY_VALUE
      : `${difference >= 0 ? '+' : ''}${difference.toFixed(1)}% Δ`;
  // 공연 기록이 없으면 서버가 avgScore 0을 줄 수 있어, 그대로 계산하면 F로 오인된다.
  const grade = stat && stat.totalSongs > 0 ? getScoreGrade(stat.avgScore) : undefined;
  const gradeValue = grade ?? (hasStat ? NO_SCORE_LABEL : EMPTY_VALUE);
  // N/A는 등급이 아니라 데이터 없음이므로 기본 값 색(zinc-100) 대신 죽인 색으로 구분한다.
  const gradeClassName = grade ? GRADE_CLASS[grade] : hasStat ? 'text-zinc-500' : undefined;

  return (
    <SettingsPanel title="PERFORMANCE STATUS" icon={<ChartIcon />}>
      {/* RECENT ACTIVITY와 같은 자리(콘텐츠 래퍼 우상단)에 둬야 세로로 붙은 두 패널의 액션이 한 줄로 맞는다. */}
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={isFetching}
        className={cn(
          jetBrainsMono.className,
          'absolute right-0 top-0 flex items-center gap-1.5 border px-2.5 py-1.5 text-[0.5rem] font-bold tracking-[0.12em] transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300',
          'disabled:cursor-wait disabled:text-zinc-600',
          // 아직 갱신 전이면 이 버튼이 유일한 진입점이므로 눈에 띄게 둔다.
          hasStat
            ? 'border-white/10 bg-black/25 text-zinc-400 hover:border-cyan-300/50 hover:text-cyan-200'
            : 'border-cyan-400/50 bg-cyan-300/[0.04] text-cyan-300 hover:border-cyan-300 hover:bg-cyan-300/[0.1]',
        )}
      >
        <span className={cn(isFetching && 'animate-spin')}>
          <RefreshIcon />
        </span>
        {isFetching ? 'SYNCING...' : hasStat ? 'REFRESH' : 'LOAD_STATS'}
      </button>

      <div className="mt-7 grid grid-cols-3 divide-x divide-white/[0.07]">
        <StatColumn
          label="AVG SCORE"
          value={stat ? stat.avgScore.toFixed(1) : EMPTY_VALUE}
          caption={differenceCaption}
          captionTone={getDifferenceTone(difference)}
          valueClassName={hasStat ? 'text-cyan-300' : undefined}
          isLoading={isInitialLoading}
        />
        <StatColumn
          label="TOTAL SONGS"
          value={stat ? formatCount(stat.totalSongs) : EMPTY_VALUE}
          caption="ALL_TIME"
          captionTone="muted"
          isLoading={isInitialLoading}
        />
        <StatColumn
          label="GRADE"
          value={gradeValue}
          caption="AVG_BASED"
          captionTone="muted"
          valueClassName={gradeClassName}
          isLoading={isInitialLoading}
        />
      </div>

      <p
        className={cn(
          jetBrainsMono.className,
          'mt-6 border-t border-white/[0.06] pt-4 text-[0.5rem] tracking-[0.12em] text-zinc-600',
        )}
      >
        UPDATED: {formatUpdatedAt(stat?.updatedAt)}
      </p>

      {isError && (
        <p
          role="alert"
          className={cn(
            jetBrainsMono.className,
            'mt-3 text-[0.5rem] tracking-[0.12em] text-fuchsia-400',
          )}
        >
          [ERROR] 통계를 갱신하지 못했습니다. 다시 시도해 주세요.
        </p>
      )}
    </SettingsPanel>
  );
}
