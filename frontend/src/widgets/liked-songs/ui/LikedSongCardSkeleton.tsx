import { Skeleton } from '@/shared/ui/skeleton/Skeleton';

/** LikedSongCard와 같은 골격. 로딩이 끝나 실제 카드로 바뀔 때 레이아웃이 튀지 않게 크기를 맞춘다. */
export function LikedSongCardSkeleton() {
  return (
    <div className="relative flex gap-5 overflow-hidden border border-white/10 bg-[#141417] p-4">
      <Skeleton tone="faint" className="size-32 shrink-0" />

      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton tone="faint" className="size-5" />
        </div>

        <Skeleton tone="strong" className="mt-3 h-4 w-2/3" />
        <Skeleton tone="faint" className="mt-2 h-3 w-1/3" />

        <div className="mt-auto flex gap-2 pt-3">
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-6 w-28" />
        </div>
      </div>
    </div>
  );
}
