'use client';

import { useEffect } from 'react';

import { useRoomStore } from '@/entities/room';

import { useStageStore } from '../../model/stageStore';
import { MediaControlsOverlay } from './overlays/MediaControlsOverlay';
import { StageBackdrop } from './StageBackdrop';

/** 점수(또는 실패 안내)를 보여준 뒤 자동으로 다음 단계로 넘어가기까지의 시간 */
const SCORE_DISPLAY_MS = 5000;

/** WaitingControls의 시작 최소 인원과 같은 기준 — 그 아래로 줄면 대기 화면으로 돌아간다 */
const MIN_PARTICIPANTS_TO_CONTINUE = 2;

function scoreLabel(score: number) {
  if (score >= 95) return 'PERFECT';
  if (score >= 80) return 'GREAT';
  return 'GOOD';
}

export function ScoreStage() {
  // 점수는 채점 완료 후 LEADERBOARD_UPDATED 이벤트가 채운다. 그 전까지 채점 중으로 표시한다.
  const score = useStageStore((state) => state.score);
  const scoringFailed = useStageStore((state) => state.scoringFailed);
  const advanceToSingerSelect = useStageStore((state) => state.advanceToSingerSelect);
  const endStage = useStageStore((state) => state.endStage);
  const participants = useRoomStore((state) => state.participants);
  const participantCount = participants.length;

  const isScoring = score === null && !scoringFailed;
  const canContinue = participantCount >= MIN_PARTICIPANTS_TO_CONTINUE;

  // 채점이 끝나면 점수를 잠깐 보여준 뒤 다음 가창자 선택으로 자동 전이한다.
  // 전용 브로드캐스트가 없어 각자 같은 채점 이벤트 수신 시점 기준으로 타이머를 돌린다.
  // 인원이 최소 인원 아래로 줄었으면 대기 화면으로 — 가창자 선택에는 되돌아갈 방법이 없다.
  useEffect(() => {
    if (isScoring) {
      return;
    }

    const timer = setTimeout(canContinue ? advanceToSingerSelect : endStage, SCORE_DISPLAY_MS);

    return () => clearTimeout(timer);
  }, [isScoring, canContinue, advanceToSingerSelect, endStage]);

  return (
    <StageBackdrop>
      <MediaControlsOverlay />

      <div className="absolute inset-0 grid place-items-center">
        <div className="relative grid size-72 place-content-center place-items-center rounded-full border-[5px] border-white/35 bg-black/25 backdrop-blur-[2px]">
          {isScoring ? (
            <div
              aria-hidden="true"
              className="absolute -inset-[5px] animate-spin rounded-full border-[5px] border-transparent border-t-cyan-300/90 [animation-duration:1.4s]"
            />
          ) : null}
          {scoringFailed ? (
            <p className="text-3xl font-black tracking-tight text-rose-400">채점 실패</p>
          ) : score === null ? (
            <>
              <p className="animate-pulse text-3xl font-black tracking-tight text-cyan-300">
                채점 중...
              </p>
              <p className="mt-2 font-mono text-[10px] tracking-[0.3em] text-zinc-500">
                ANALYZING VOCAL
              </p>
            </>
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

      {isScoring ? null : (
        <p className="absolute inset-x-0 bottom-16 text-center font-mono text-xs tracking-[0.18em] text-zinc-400">
          {canContinue
            ? '잠시 후 가창자 선택으로 넘어갑니다...'
            : '잠시 후 대기 화면으로 돌아갑니다...'}
        </p>
      )}
    </StageBackdrop>
  );
}
