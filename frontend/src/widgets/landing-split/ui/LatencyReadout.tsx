'use client';

import { useEffect, useState } from 'react';

import { LATENCY_READOUT } from '../config/landingStage';

const randomLatencyMs = () =>
  Math.floor(Math.random() * (LATENCY_READOUT.maxMs - LATENCY_READOUT.minMs + 1)) +
  LATENCY_READOUT.minMs;

export function LatencyReadout() {
  // SSR과 첫 클라이언트 렌더는 고정값으로 맞추고(hydration mismatch 방지), 이후 인터벌마다 랜덤 갱신
  const [latencyMs, setLatencyMs] = useState<number>(LATENCY_READOUT.initialMs);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setLatencyMs(randomLatencyMs());
    }, LATENCY_READOUT.updateIntervalMs);

    return () => window.clearInterval(intervalId);
  }, []);

  return <p>LATENCY: {latencyMs}ms // STABLE</p>;
}
