const RING_SIZE = 240;
const RING_RADIUS = 104;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface ScoreCircleProps {
  /** 최종 점수(0~100). 분석 전이면 null */
  score: number | null;
}

/** 최종 점수 링. 링 채움이 점수에 비례하고, 트랙은 같은 계열의 옅은 단계를 쓴다. */
export function ScoreCircle({ score }: ScoreCircleProps) {
  const ratio = score !== null ? Math.min(Math.max(score, 0), 100) / 100 : 0;

  return (
    <div className="relative mx-auto" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="rgb(34 211 238 / 0.12)"
          strokeWidth="6"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE * ratio} ${RING_CIRCUMFERENCE}`}
          className="drop-shadow-[0_0_10px_rgba(34,211,238,0.45)]"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-mono text-[0.55rem] font-bold tracking-[0.3em] text-cyan-300/80">
          FINAL_SCORE
        </p>
        <p className="mt-2 font-sans text-7xl font-black leading-none tracking-tight text-white [text-shadow:0_0_28px_rgba(34,211,238,0.35)]">
          {score !== null ? score : '--'}
        </p>
        <p className="mt-2 font-mono text-[0.55rem] font-bold tracking-[0.24em] text-zinc-600">
          / 100 PTS
        </p>
      </div>
    </div>
  );
}
