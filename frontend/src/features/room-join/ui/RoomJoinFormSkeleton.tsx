import { Skeleton } from '@/shared/ui/skeleton/Skeleton';

/**
 * RoomJoinForm의 Suspense 폴백. 폼이 useSearchParams로 초대 코드를 읽는 동안
 * 패널이 빈 채로 남지 않도록 같은 높이의 자리를 잡아 둔다.
 */
export function RoomJoinFormSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-4 w-20" />
        <Skeleton tone="dim" className="mt-3 h-14 w-full border border-white/15" />
      </div>
      <Skeleton tone="faint" className="h-12 w-full" />
    </div>
  );
}
