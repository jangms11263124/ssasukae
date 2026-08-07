'use client';

import { useEffect } from 'react';

import { useRoomStore } from '@/entities/room';
import { cn } from '@/shared/lib/cn';
import { getScoreGrade, type ScoreGrade } from '@/shared/lib/scoreGrade';

import { useStageStore } from '../../model/stageStore';
import { MediaControlsOverlay } from './overlays/MediaControlsOverlay';
import { StageBackdrop } from './StageBackdrop';

/** 점수(또는 실패 안내)를 보여준 뒤 자동으로 다음 단계로 넘어가기까지의 시간 */
const SCORE_DISPLAY_MS = 5000;

/**
 * 채점 결과를 기다리는 최대 시간. 서버도 analysis-timeout(1분) 뒤 실패를 브로드캐스트하지만,
 * 그 이벤트를 놓치면(소켓 재연결 틈 등) 영영 "채점 중..."에 갇히므로 여유를 더해 로컬에서도 푼다.
 */
const SCORING_TIMEOUT_MS = 90_000;

/** WaitingControls의 시작 최소 인원과 같은 기준 — 그 아래로 줄면 대기 화면으로 돌아간다 */
const MIN_PARTICIPANTS_TO_START = 2;

// 음수 delay로 각 막대가 처음부터 서로 다른 위상에서 일렁인다 (MainHome LATENCY_BARS와 같은 방식)
const SCORING_BARS = [
  { delay: '0s', height: 18 },
  { delay: '-1.2s', height: 30 },
  { delay: '-0.5s', height: 22 },
  { delay: '-1.5s', height: 34 },
  { delay: '-0.8s', height: 24 },
  { delay: '-0.3s', height: 16 },
] as const;

/** 등급별 결과 문구 — 구간(S~F)은 마이페이지·AI 피드백과 같은 scoreGrade.ts 기준을 쓴다 */
const SCORE_LABEL: Record<ScoreGrade, string> = {
  S: 'PERFECT',
  A: 'EXCELLENT',
  B: 'GREAT',
  C: 'GOOD',
  D: 'NICE TRY',
  F: 'TRY AGAIN',
};

export function ScoreStage() {
  // 점수는 채점 완료 후 LEADERBOARD_UPDATED 이벤트가 채운다. 그 전까지 채점 중으로 표시한다.
  const score = useStageStore((state) => state.score);
  const scoringFailed = useStageStore((state) => state.scoringFailed);
  const advanceToSingerSelect = useStageStore((state) => state.advanceToSingerSelect);
  const applyScoringFailed = useStageStore((state) => state.applyScoringFailed);
  const endStage = useStageStore((state) => state.endStage);
  const participants = useRoomStore((state) => state.participants);
  const participantCount = participants.length;

  const isScoring = score === null && !scoringFailed;
  const canContinue = participantCount >= MIN_PARTICIPANTS_TO_START;

  // 안전망 — 서버의 실패 브로드캐스트까지 놓친 경우에도 여기서 갇히지 않게 로컬에서 푼다.
  useEffect(() => {
    if (!isScoring) {
      return;
    }

    const timer = setTimeout(applyScoringFailed, SCORING_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [isScoring, applyScoringFailed]);

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
        <div
          className={cn(
            'relative grid size-72 place-content-center place-items-center rounded-full border-[5px] bg-black/25 backdrop-blur-[2px]',
            // 채점 중에는 링을 죽여 회전 아크가 도드라지게, 결과가 뜨면 원래 링으로 돌아온다
            isScoring ? 'border-white/10' : 'border-white/35',
          )}
        >
          {isScoring ? (
            <>
              {/* 혜성 꼬리 아크 — 머리는 진한 시안, 꼬리는 옅게 뒤따른다 */}
              <div
                aria-hidden="true"
                className="absolute -inset-[5px] animate-spin rounded-full border-[5px] border-transparent border-t-cyan-300 border-r-cyan-300/25 drop-shadow-[0_0_12px_rgba(34,211,238,0.55)] [animation-duration:1.4s]"
              />
              {/* 안쪽 역회전 보조 링 — 푸시아 포인트 */}
              <div
                aria-hidden="true"
                className="absolute inset-3 animate-spin rounded-full border border-transparent border-b-fuchsia-400/70 [animation-direction:reverse] [animation-duration:2.6s]"
              />
            </>
          ) : null}
          {scoringFailed ? (
            <>
              <p className="text-3xl font-black tracking-tight text-rose-400">
                채점하지 못했어요
              </p>
              <p className="mt-2 font-mono text-[10px] tracking-[0.3em] text-zinc-500">
                ANALYSIS_FAILED
              </p>
            </>
          ) : score === null ? (
            <>
              <div className="flex h-9 items-end justify-center gap-1.5" aria-hidden="true">
                {SCORING_BARS.map((bar, index) => (
                  <span
                    key={index}
                    className="w-1.5 origin-bottom animate-latency-bar rounded-full bg-cyan-300/90 shadow-[0_0_10px_rgba(34,211,238,0.55)]"
                    style={{ animationDelay: bar.delay, height: bar.height }}
                  />
                ))}
              </div>
              <p className="mt-4 text-2xl font-black tracking-tight text-cyan-300">채점 중...</p>
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
                {SCORE_LABEL[getScoreGrade(score)]}
              </p>
            </>
          )}
        </div>
      </div>

      {isScoring ? null : (
        <p className="absolute inset-x-0 top-10 text-center font-mono text-xs tracking-[0.18em] text-zinc-400">
          {canContinue
            ? '잠시 후 가창자 선택으로 넘어갑니다...'
            : '잠시 후 대기 화면으로 돌아갑니다...'}
        </p>
      )}
    </StageBackdrop>
  );
}
