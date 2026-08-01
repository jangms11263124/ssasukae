import type { ReactNode, Ref } from 'react';

interface StageBackdropProps {
  children: ReactNode;
  /** 배경 가운데 안내 문구. null이면 표시하지 않는다 */
  placeholder?: string | null;
  ref?: Ref<HTMLDivElement>;
}

// 캠 화면·오버레이·가상 커서가 모두 이 안에 얹혀 무대 좌표(0,0)의 기준점이 된다.
export function StageBackdrop({ children, placeholder = null, ref }: StageBackdropProps) {
  return (
    <div ref={ref} className="relative size-full overflow-hidden bg-[#151518]">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_25%,rgba(34,211,238,0.09),transparent_55%),radial-gradient(ellipse_at_82%_75%,rgba(217,70,239,0.07),transparent_45%)]"
      />
      {placeholder !== null ? (
        // 캠이 없을 때 무대에 유일하게 남는 안내라 크고 밝게 보여준다.
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-14 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-zinc-400"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-6"
            >
              <rect x="3" y="7" width="12" height="10" rx="1.5" />
              <path d="m15 11 6-3v8l-6-3" />
              <path d="m4 4 16 16" />
            </svg>
          </span>
          <p className="text-base font-semibold tracking-[0.04em] text-zinc-300">{placeholder}</p>
        </div>
      ) : null}
      {children}
    </div>
  );
}
