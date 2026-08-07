import { anybody } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';
import { SettingsPanel } from '@/shared/ui/panel/SettingsPanel';
import { Skeleton } from '@/shared/ui/skeleton/Skeleton';

import { ACTIVITY_PREVIEW_COUNT, FAVORITES_PREVIEW_COUNT } from '../config/preview';
import { ChartIcon, HeartIcon, HistoryIcon } from './icons';

const STAT_COLUMN_COUNT = 3;

/** FavoritesCard·RecentActivityCard의 목록 한 줄과 같은 높이. */
function TrackRowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.04] py-3.5 last:border-b-0">
      <Skeleton tone="faint" className="size-10 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton tone="strong" className="h-3 w-1/2" />
        <Skeleton tone="faint" className="h-2 w-1/4" />
      </div>
    </div>
  );
}

function TrackListSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, index) => (
        <TrackRowSkeleton key={index} />
      ))}
    </div>
  );
}

/** ProfileCard 자리. 실제 카드와 같은 테두리·배경·패딩을 그대로 쓴다. */
function ProfileCardSkeleton() {
  return (
    <section
      className={cn(
        anybody.className,
        'relative border border-white/[0.08] bg-[linear-gradient(135deg,#1d1d1d_0%,#151515_62%,#101010_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-7',
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_4px,rgba(255,255,255,0.012)_5px)]"
      />

      <div className="relative flex flex-col gap-7 sm:flex-row sm:gap-9">
        <Skeleton tone="dim" className="size-40 shrink-0 border border-white/10 sm:size-52" />

        <div className="flex min-w-0 flex-1 flex-col">
          <Skeleton tone="strong" className="h-6 w-48" />

          <div className="mt-7 grid gap-7 sm:grid-cols-2">
            <div className="space-y-3">
              <Skeleton className="h-2 w-40" />
              <Skeleton tone="faint" className="h-2.5 w-28" />
              <Skeleton tone="faint" className="h-2.5 w-36" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-2 w-36" />
              <Skeleton tone="faint" className="h-2.5 w-44" />
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Skeleton tone="faint" className="h-11 w-44" />
            <Skeleton tone="faint" className="h-11 w-36" />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 마이페이지 로딩 자리. 정적인 패널 제목은 실제 카드와 똑같이 그리고 데이터 자리만 스켈레톤으로 둬,
 * 로딩이 끝날 때 제목이 다시 그려지지 않고 내용만 채워지게 한다.
 */
export function MyPageSkeleton() {
  return (
    <div className="relative mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
      <p role="status" className="sr-only">
        마이페이지 정보를 불러오고 있어요.
      </p>

      <ProfileCardSkeleton />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(20rem,1fr)_minmax(0,2fr)]">
        <SettingsPanel title="FAVORITES" icon={<HeartIcon />}>
          <div className="mt-7 flex items-baseline justify-between gap-3 border-b border-white/[0.07] pb-3">
            <Skeleton className="h-2 w-24" />
            <Skeleton tone="faint" className="h-2.5 w-16" />
          </div>
          <TrackListSkeleton rows={FAVORITES_PREVIEW_COUNT} />
        </SettingsPanel>

        <div className="flex flex-col gap-4">
          <SettingsPanel title="PERFORMANCE STATUS" icon={<ChartIcon />}>
            <div className="mt-7 grid grid-cols-3 divide-x divide-white/[0.07]">
              {Array.from({ length: STAT_COLUMN_COUNT }, (_, index) => (
                <div key={index} className="space-y-3 px-5 first:pl-0 last:pr-0">
                  <Skeleton className="h-2 w-20" />
                  <Skeleton tone="strong" className="h-6 w-16" />
                  <Skeleton tone="faint" className="h-2 w-14" />
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-white/[0.06] pt-4">
              <Skeleton tone="faint" className="h-2 w-40" />
            </div>
          </SettingsPanel>

          <SettingsPanel title="RECENT ACTIVITY" icon={<HistoryIcon />} className="flex-1">
            <div className="mt-7 grid grid-cols-[1fr_5rem_4rem] items-center gap-3 border-b border-white/[0.07] pb-3">
              <Skeleton className="h-2 w-24" />
              <Skeleton className="h-2 w-10 justify-self-end" />
              <Skeleton className="h-2 w-10 justify-self-end" />
            </div>
            <TrackListSkeleton rows={ACTIVITY_PREVIEW_COUNT} />
          </SettingsPanel>
        </div>
      </div>
    </div>
  );
}
