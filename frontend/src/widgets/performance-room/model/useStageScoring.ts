import { useEffect, useRef } from 'react';

import { reportAnalysisFailure, submitDemoScore } from '@/entities/performance';
import { useAuth } from '@/entities/user';
import type { ScoringSession } from '@/features/performance-scoring';
import {
  DEMO_MOCK_SCORING,
  DEMO_MOCK_SCORING_DELAY_MS,
} from '@/features/performance-scoring/config/scoringConfig';
import type { VocalAudioEngine } from '@/features/vocal-audio-engine';
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';
import { showToast } from '@/shared/model/toastStore';

import { useStageStore } from './stageStore';

/**
 * 백엔드가 내려주는 난이도를 AI의 difficultyScore(0~100)로 그대로 보낸다.
 * 분석 파이프라인이 산출한 값이 곧 난이도 점수라, 프론트에서 다시 환산하지 않는다.
 * 난이도가 없는 곡은 보너스 없이(0) 채점한다.
 */
function toDifficultyScore(difficultyLevel: number | null | undefined): number {
  if (difficultyLevel == null) return 0;

  return Math.min(100, Math.max(0, difficultyLevel));
}

export function useStageScoring(isPerformer: boolean, engine: VocalAudioEngine | null): void {
  const phase = useStageStore((state) => state.phase);
  const isSuspended = useStageStore((state) => state.isSuspended);
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const sessionRef = useRef<ScoringSession | null>(null);

  // 시연용 데모 채점 — 가창자만 공연 종료 후 서버에 mock 점수를 보낸다.
  useEffect(() => {
    if (!DEMO_MOCK_SCORING || !isPerformer || phase !== 'SCORE') return;

    const { performanceId, applyScoringFailed } = useStageStore.getState();

    if (performanceId === null) {
      applyScoringFailed();
      showToast('공연 정보가 없어 채점할 수 없어요.', 'error');
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;

      submitDemoScore(performanceId).catch((error) => {
        if (cancelled) return;
        applyScoringFailed();
        showToast(getApiErrorMessage(error, '채점 요청에 실패했어요.'), 'error');
        reportAnalysisFailure(performanceId).catch(() => {});
      });
    }, DEMO_MOCK_SCORING_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isPerformer, phase]);

  // 공연이 시작된 뒤에 내려받으면 그동안 부른 첫 소절이 통째로 빠진다.
  // MR을 선로딩하는 READY 단계에서 미리 받아 둔다 (엔진의 MR 선로딩과 같은 타이밍).
  useEffect(() => {
    if (DEMO_MOCK_SCORING || !isPerformer || phase !== 'READY') return;

    void import('@/features/performance-scoring');
  }, [isPerformer, phase]);

  // 수집 — 가창자 본인이 공연을 재생하는 동안만 돈다.
  useEffect(() => {
    if (DEMO_MOCK_SCORING || !isPerformer || engine === null || phase !== 'PERFORMING') return;

    let cancelled = false;
    let created: ScoringSession | null = null;

    // pitchy·MediaRecorder 수집기는 가창자만 쓴다. 정적으로 묶으면 노래하지 않는 참가자도
    // 방에 들어오는 순간 함께 내려받는다 (오디오 엔진이 Tone.js를 다루는 방식과 같다).
    import('@/features/performance-scoring')
      .then(({ ScoringSession }) => {
        if (cancelled) return;

        const session = new ScoringSession({
          captureStream: engine.getVocalCaptureStream(),
          analyser: engine.getVocalAnalyser(),
          // 지금 분석기에 도착한 목소리는 왕복 지연만큼 앞선 MR을 듣고 부른 소리다.
          // 곡 도입부에선 음수가 나올 수 있고, 음수 시각은 길이 0 note가 되어 AI가 400으로
          // 거절하므로 0으로 막는다 (SingerPitchCollector의 기존 함정과 동일).
          getTimeMs: () =>
            Math.max(0, engine.getMrPositionMs() - engine.getVoiceLatencyInMrMs()),
          getKeyOffset: () => engine.getAppliedKeyOffset(),
        });

        if (!session.isSttSupported) {
          showToast(
            '이 브라우저는 가사 인식을 지원하지 않아 가사 점수가 0점이에요.',
            'error',
          );
        }

        session.start();
        // 내려받는 사이에 공연이 멈췄을 수 있다. 지금 상태를 다시 보고 맞춘다.
        if (useStageStore.getState().isSuspended) session.pause();

        created = session;
        sessionRef.current = session;
      })
      .catch(() => {
        showToast('채점 기능을 불러오지 못해 이번 공연은 채점되지 않아요.', 'error');
      });

    return () => {
      cancelled = true;
      // 수집만 닫는다. 결과를 보낼지 버릴지는 다음 단계를 보고 아래 효과가 정한다.
      void created?.finish();
    };
  }, [isPerformer, engine, phase]);

  // 일시 중지 동안에는 MR 시간축이 멈춰 있어 수집해도 쓸 수 없는 데이터가 된다.
  useEffect(() => {
    if (DEMO_MOCK_SCORING) return;

    const session = sessionRef.current;
    if (session === null || phase !== 'PERFORMING') return;

    if (isSuspended) {
      session.pause();
    } else {
      session.resume();
    }
  }, [phase, isSuspended]);

  // 전송 — 무대가 PERFORMING을 벗어난 순간 한 번.
  useEffect(() => {
    if (DEMO_MOCK_SCORING) return;

    const session = sessionRef.current;
    if (session === null || phase === 'PERFORMING') return;

    sessionRef.current = null;

    // 공연 취소·방 이탈로 빠져나온 경우다. 모은 데이터는 버린다.
    if (phase !== 'SCORE') return;

    const {
      performanceId,
      selectedSong,
      midiJsonDownloadUrl,
      lyricsDownloadUrl,
      applyScoringFailed,
    } = useStageStore.getState();

    const failScoring = (message: string) => {
      // 내 화면은 즉시 풀고, 서버에도 알려 다른 참가자의 "채점 중..."도 함께 풀어 준다
      // (서버가 ANALYSIS_FAILED로 전이하고 PERFORMANCE_STATE_CHANGED를 브로드캐스트한다).
      applyScoringFailed();
      showToast(message, 'error');
      // 성공 콜백·타임아웃 처리와 경합해 이미 끝난 공연이면 서버가 거절한다 — 그대로 둬도
      // 방 전체 상태는 서버 쪽 결과를 따라가므로 실패를 다시 알리지 않는다.
      if (performanceId !== null) {
        reportAnalysisFailure(performanceId).catch(() => {});
      }
    };

    if (
      performanceId === null ||
      userId === null ||
      selectedSong == null ||
      midiJsonDownloadUrl === null ||
      lyricsDownloadUrl === null
    ) {
      failScoring('공연 정보가 없어 채점할 수 없어요.');
      return;
    }

    void (async () => {
      try {
        const { stt, singerMidi } = await session.finish();

        // AI는 빈 transcript와 빈 notes를 400으로 거절한다. 무의미한 요청을 보내는 대신
        // 바로 실패로 넘겨 "채점 중..."에 갇히지 않게 한다.
        if (singerMidi.notes.length === 0 || stt.fullTranscript.trim() === '') {
          failScoring('가창 음성을 인식하지 못해 채점할 수 없어요.');
          return;
        }

        // 수집 모듈은 공연 시작 때 이미 받아 뒀다 — 여기서는 캐시된 청크를 그대로 쓴다.
        const { fetchLyricsText, fetchReferenceMidi, submitFinalScore } = await import(
          '@/features/performance-scoring'
        );
        const [referenceMidi, lyrics] = await Promise.all([
          fetchReferenceMidi(midiJsonDownloadUrl),
          fetchLyricsText(lyricsDownloadUrl),
        ]);

        await submitFinalScore({
          performanceId,
          songId: selectedSong.id,
          userId,
          difficultyScore: toDifficultyScore(selectedSong.difficultyLevel),
          lyrics,
          transcript: stt.fullTranscript,
          referenceMidi,
          singerMidi,
        });
      } catch (error) {
        failScoring(getApiErrorMessage(error, '채점 요청에 실패했어요.'));
      }
    })();
  }, [phase, userId]);
}
