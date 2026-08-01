import type { GestureCancelProgress } from '../model/GestureDetector';

// r=32 원의 둘레.
const CIRCUMFERENCE = 201.06;

interface GestureCancelCountdownProps {
  progress: GestureCancelProgress;
}

// 양손 X자 유지 중에만 뜨는 공연 종료 카운트다운.
export function GestureCancelCountdown({ progress }: GestureCancelCountdownProps) {
  const offset = CIRCUMFERENCE - CIRCUMFERENCE * (progress.percent / 100);

  return (
    // 되돌릴 수 없는 동작이라 무대 정중앙에 크게 띄워 놓치지 않게 한다.
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
      <span className="relative grid size-[88px] place-items-center">
        <svg viewBox="0 0 80 80" className="size-[88px] -rotate-90">
          <circle
            cx="40"
            cy="40"
            r="32"
            fill="rgba(8,10,18,0.82)"
            strokeWidth="6"
            className="stroke-white/12"
          />
          <circle
            cx="40"
            cy="40"
            r="32"
            fill="transparent"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="stroke-[#ff3b30] transition-[stroke-dashoffset] duration-75 [filter:drop-shadow(0_0_6px_rgba(255,59,48,0.8))]"
          />
        </svg>
        <span className="absolute text-4xl font-black tabular-nums text-white drop-shadow-[0_0_14px_rgba(255,59,48,0.95)]">
          {progress.remainingSec}
        </span>
      </span>
      <span className="rounded-full border-[1.5px] border-[#ff3b30]/55 bg-[#0c101e]/90 px-3.5 py-1 text-center font-mono text-[11px] font-bold tracking-[0.14em] text-[#ff8078] shadow-[0_0_20px_rgba(255,59,48,0.35)]">
        공연 종료 · 손을 풀면 취소
      </span>
    </div>
  );
}