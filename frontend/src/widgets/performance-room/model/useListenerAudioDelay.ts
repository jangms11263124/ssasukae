'use client';

import { useCallback, useEffect, useRef } from 'react';

import { LISTENER_AUDIO_BASE_DELAY_MS, LISTENER_LYRICS_DELAY_MS } from '@/features/lyrics-sync';

import { useOpenViduSessionContext } from './OpenViduSessionContext';
import { useStageStore } from './stageStore';

/** getStats 폴링 주기. 지터 버퍼는 초 단위로 적응하므로 이 정도면 따라간다 */
const STATS_POLL_INTERVAL_MS = 1_000;
/** 새 측정값 반영 비율. 순간 튀는 값이 하이라이트를 흔들지 않게 지수이동평균으로 누른다 */
const JITTER_EMA_ALPHA = 0.3;

/** inbound-rtp의 지터 버퍼 누적치. 두 스냅샷의 차분이 그 구간의 평균 체류시간이 된다 */
interface JitterBufferSnapshot {
  delaySeconds: number;
  emittedCount: number;
}

/** 표준에는 있지만 TS dom 타입에 아직 없는 필드라 선택 속성으로 보강한다 */
type InboundAudioStats = RTCInboundRtpStreamStats & {
  jitterBufferDelay?: number;
  jitterBufferEmittedCount?: number;
};

async function readJitterBufferSnapshot(
  peerConnection: RTCPeerConnection,
): Promise<JitterBufferSnapshot | null> {
  const report = await peerConnection.getStats();
  let snapshot: JitterBufferSnapshot | null = null;

  report.forEach((stats: InboundAudioStats) => {
    if (stats.type !== 'inbound-rtp' || stats.kind !== 'audio') return;
    if (stats.jitterBufferDelay === undefined || stats.jitterBufferEmittedCount === undefined) {
      return;
    }

    snapshot = {
      delaySeconds: stats.jitterBufferDelay,
      emittedCount: stats.jitterBufferEmittedCount,
    };
  });

  return snapshot;
}

/**
 * 청자가 가창자 오디오를 실제로 듣기까지의 지연(ms)을 추정하는 함수를 만든다.
 *
 * 고정 상수(LISTENER_LYRICS_DELAY_MS)는 참가자마다 다르고 공연 중에도 변하는 실제
 * 지연을 못 따라간다 — 특히 WebRTC 지터 버퍼는 네트워크 상태에 맞춰 계속 커졌다
 * 작아진다. 그래서 가창자 구독 스트림의 getStats에서 지터 버퍼 체류시간을 실측하고,
 * 잴 수 없는 처리 비용(LISTENER_AUDIO_BASE_DELAY_MS)을 더해 지연으로 쓴다.
 *
 * 네트워크 전송 지연을 더하지 않는 이유: 가사 시계의 기준(MR 위치 시그널·재생 시작
 * 이벤트)도 같은 네트워크를 건너오므로 전송분은 서로 상쇄된다.
 *
 * 측정이 아직 없거나(공연 초, 미지원 브라우저) 스트림이 없으면 폴백 상수를 반환한다.
 * 반환 함수는 ref만 읽으므로 리렌더를 일으키지 않는다 — 가사 틱이 매번 호출한다.
 */
export function useListenerAudioDelay(isPerformer: boolean): () => number {
  const { remoteStreams } = useOpenViduSessionContext();
  const phase = useStageStore((state) => state.phase);
  const performerParticipantId = useStageStore((state) => state.performerParticipantId);

  const shouldMeasure = !isPerformer && phase === 'PERFORMING' && performerParticipantId !== null;
  const performerStream = shouldMeasure
    ? (remoteStreams.get(performerParticipantId)?.streamManager.stream ?? null)
    : null;

  const delayMsRef = useRef(LISTENER_LYRICS_DELAY_MS);

  useEffect(() => {
    if (performerStream === null) return;

    let previous: JitterBufferSnapshot | null = null;
    let smoothedJitterMs: number | null = null;
    let disposed = false;

    const poll = async () => {
      try {
        const snapshot = await readJitterBufferSnapshot(performerStream.getRTCPeerConnection());
        if (disposed || snapshot === null) return;

        const base = previous;
        previous = snapshot;
        // 첫 스냅샷은 기준점만 잡는다. 카운트가 늘지 않았으면(무음 등) 지난 값을 유지한다.
        if (base === null || snapshot.emittedCount <= base.emittedCount) return;

        const jitterMs =
          ((snapshot.delaySeconds - base.delaySeconds) /
            (snapshot.emittedCount - base.emittedCount)) *
          1_000;
        smoothedJitterMs =
          smoothedJitterMs === null
            ? jitterMs
            : smoothedJitterMs + (jitterMs - smoothedJitterMs) * JITTER_EMA_ALPHA;

        delayMsRef.current = LISTENER_AUDIO_BASE_DELAY_MS + smoothedJitterMs;
      } catch {
        // 재접속 직전 등 PeerConnection이 닫히는 순간의 실패 — 마지막 추정치를 유지한다
      }
    };

    void poll();
    const intervalId = setInterval(() => void poll(), STATS_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(intervalId);
      // 다음 공연·다른 가창자의 스트림에 지난 측정이 새지 않게 폴백으로 되돌린다
      delayMsRef.current = LISTENER_LYRICS_DELAY_MS;
    };
  }, [performerStream]);

  return useCallback(() => delayMsRef.current, []);
}
