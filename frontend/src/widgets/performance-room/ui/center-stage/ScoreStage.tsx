'use client';

import { useStageStore } from '../../model/stageStore';
import { MediaControlsOverlay } from './overlays/MediaControlsOverlay';
import { StageBackdrop } from './StageBackdrop';

function scoreLabel(score: number) {
  if (score >= 95) return 'PERFECT';
  if (score >= 80) return 'GREAT';
  return 'GOOD';
}

interface ScoreStageProps {
  canEndStage: boolean;
}

export function ScoreStage({ canEndStage }: ScoreStageProps) {
  // 채점 결과(리더보드) 이벤트가 백엔드 미완성이라 점수가 없으면 채점 중으로 표시한다.
  const score = useStageStore((state) => state.score);
  const endStage = useStageStore((state) => state.endStage);

  return (
    <StageBackdrop>
      <MediaControlsOverlay />

      <div className="absolute inset-0 grid place-items-center">
        <div className="grid size-72 place-content-center place-items-center rounded-full border-[5px] border-white/35 bg-black/25 backdrop-blur-[2px]">
          {score === null ? (
            <p className="text-3xl font-black tracking-tight text-cyan-300">채점 중...</p>
          ) : (
            <>
              <p className="text-8xl font-black italic leading-none text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.7)]">
                {score}
              </p>
              <p className="mt-1 text-4xl font-black tracking-tight text-cyan-300">
                {scoreLabel(score)}
              </p>
            </>
          )}
        </div>
      </div>

      {canEndStage ? (
        <button
          type="button"
          onClick={endStage}
          className="absolute bottom-5 right-5 min-w-40 bg-white px-8 py-3 text-sm font-semibold text-black transition-colors hover:bg-cyan-100"
        >
          무대 종료
        </button>
      ) : null}
    </StageBackdrop>
  );
}
