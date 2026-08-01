import type { RefObject } from 'react';

interface GestureCursorProps {
  cursorRef: RefObject<HTMLDivElement | null>;
}

/**
 * 손을 따라다니는 가상 커서. 위치는 리렌더를 피하려고 useGestureControl이
 * transform으로 직접 갱신하고, 여기서는 스타일만 정의한다.
 */
export function GestureCursor({ cursorRef }: GestureCursorProps) {
  return (
    <div
      ref={cursorRef}
      aria-hidden="true"
      data-visible="false"
      data-grabbing="false"
      className="group pointer-events-none absolute left-0 top-0 z-30 size-0 transition-opacity duration-100 data-[visible=false]:opacity-0"
    >
      <span className="absolute -left-6 -top-6 block size-12 rounded-full border-2 border-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.6)] transition-all duration-75 group-data-[grabbing=true]:-left-[22px] group-data-[grabbing=true]:-top-[22px] group-data-[grabbing=true]:size-11 group-data-[grabbing=true]:border-fuchsia-300" />
      <span className="absolute -left-1 -top-1 block size-2 rounded-full bg-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.9)] group-data-[grabbing=true]:bg-fuchsia-200" />
    </div>
  );
}
