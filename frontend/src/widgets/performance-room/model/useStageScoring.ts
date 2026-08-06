import { useEffect, useRef } from 'react';

import { useAuth } from '@/entities/user';
import type { ScoringSession } from '@/features/performance-scoring';
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

/**
 * 가창자 브라우저에서 채점 입력을 모아 공연이 끝나면 AI로 보낸다.
 * useStageAudioEngine과 같은 자리의 도메인 접착 훅이다 — 무대 상태를 도메인 무지인
 * 수집 세션에 연결하기만 한다.
 *
 * 점수 표시는 여기서 하지 않는다. AI가 Spring에 콜백하고 Spring이 LEADERBOARD_UPDATED를
 * 브로드캐스트하면 stageStore.applyScore가 받는다.
 *
 * 구독은 phase와 isSuspended 둘뿐이다. 전송에 필요한 나머지 값은 그 순간의 스냅샷이면
 * 충분해서 getState()로 읽는다 — 구독하면 곡이 바뀔 때마다 효과가 헛돈다.
 */
export function useStageScoring(isPerformer: boolean, engine: VocalAudioEngine | null): void {
  const phase = useStageStore((state) => state.phase);
  const isSuspended = useStageStore((state) => state.isSuspended);
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const sessionRef = useRef<ScoringSession | null>(null);

  // 공연이 시작된 뒤에 내려받으면 그동안 부른 첫 소절이 통째로 빠진다.
  // MR을 선로딩하는 READY 단계에서 미리 받아 둔다 (엔진의 MR 선로딩과 같은 타이밍).
  useEffect(() => {
    if (!isPerformer || phase !== 'READY') return;

    void import('@/features/performance-scoring');
  }, [isPerformer, phase]);

  // 수집 — 가창자 본인이 공연을 재생하는 동안만 돈다.
  useEffect(() => {
    if (!isPerformer || engine === null || phase !== 'PERFORMING') return;

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
          getTimeMs: () => engine.getMrPositionMs(),
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
      // 서버 쪽 공연 상태는 ANALYZING으로 남는다. 화면만이라도 실패로 풀어 준다.
      applyScoringFailed();
      showToast(message, 'error');
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
