import { Skeleton } from '@/shared/ui/skeleton/Skeleton';

/** LikedSongCard와 같은 골격. 로딩이 끝나 실제 카드로 바뀔 때 레이아웃이 튀지 않게 크기를 맞춘다. */
export function LikedSongCardSkeleton() {
  return (
    <div className="flex gap-6 border border-white/10 bg-[#161619] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
      <Skeleton tone="faint" className="size-36 shrink-0" />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton tone="faint" className="size-6" />
        </div>

        <Skeleton tone="strong" className="mt-3 h-5 w-2/3" />
        <Skeleton tone="faint" className="mt-2.5 h-3 w-1/3" />

        <div className="mt-auto flex gap-2 pt-4">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-28" />
        </div>
      </div>
    </div>
  );
}
