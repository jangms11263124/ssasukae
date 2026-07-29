import type { ReactNode } from 'react';

// 가창자 영상 스트림이 연결되기 전까지 사용하는 무대 배경 플레이스홀더.
export function StageBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative size-full overflow-hidden bg-[#151518]">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_25%,rgba(34,211,238,0.09),transparent_55%),radial-gradient(ellipse_at_82%_75%,rgba(217,70,239,0.07),transparent_45%)]"
      />
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[10px] tracking-[0.22em] text-zinc-700"
      >
        PERFORMER VIDEO STREAM
      </span>
      {children}
    </div>
  );
}
