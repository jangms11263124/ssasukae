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
  // 점수는 채점 완료 후 LEADERBOARD_UPDATED 이벤트가 채운다. 그 전까지 채점 중으로 표시한다.
  const score = useStageStore((state) => state.score);
  const scoringFailed = useStageStore((state) => state.scoringFailed);
  const endStage = useStageStore((state) => state.endStage);

  return (
    <StageBackdrop>
      <MediaControlsOverlay />

      <div className="absolute inset-0 grid place-items-center">
        <div className="grid size-72 place-content-center place-items-center rounded-full border-[5px] border-white/35 bg-black/25 backdrop-blur-[2px]">
          {scoringFailed ? (
            <p className="text-3xl font-black tracking-tight text-rose-400">채점 실패</p>
          ) : score === null ? (
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
