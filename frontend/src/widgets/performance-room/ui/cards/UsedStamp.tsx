import { cn } from '@/shared/lib/cn';

/**
 * 다 쓴 카드 앞면 위에 비스듬히 찍는 USED 도장. 카드 면 전체를 덮는 오버레이라
 * 부모가 relative + containerType(inline-size)이어야 하고, 크기는 카드 폭에 비례한다.
 */
export function UsedStamp({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 grid place-items-center', className)}
    >
      <span
        className="border-2 border-zinc-300/80 bg-zinc-950/60 font-mono font-black tracking-[0.12em] text-zinc-200/90"
        style={{
          fontSize: '13cqw',
          lineHeight: 1,
          padding: '3cqw 5cqw',
          transform: 'rotate(-14deg)',
        }}
      >
        USED
      </span>
    </div>
  );
}
