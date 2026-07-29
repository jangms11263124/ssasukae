'use client';

import { useEffect, useState } from 'react';

import { MAX_INPUT_LEVEL_DB, MIN_INPUT_LEVEL_DB } from '@/entities/media-device';

import { openMicrophoneStream, stopStream } from '../lib/mediaStream';

/** 매 프레임 setState하면 불필요한 리렌더가 쌓이므로 약 20fps로 제한한다. */
const UPDATE_INTERVAL_MS = 50;

interface UseMicLevelMeterParams {
  microphoneId: string;
  isEnabled: boolean;
}

interface LevelMeasurement {
  /** 어떤 기기의 측정값인지 함께 담아 기기를 바꾸면 이전 값이 남지 않게 한다. */
  microphoneId: string;
  levelDb: number;
}

export function useMicLevelMeter({ microphoneId, isEnabled }: UseMicLevelMeterParams) {
  const [measurement, setMeasurement] = useState<LevelMeasurement | null>(null);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    let isCancelled = false;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let frameId = 0;
    let lastUpdatedAt = 0;

    const start = async () => {
      try {
        stream = await openMicrophoneStream(microphoneId);
      } catch {
        // 마이크를 열 수 없으면 측정값 없이 유지한다. 사유는 상태 바에서 안내한다.
        return;
      }

      if (isCancelled) {
        stopStream(stream);
        stream = null;
        return;
      }

      audioContext = new AudioContext();

      await audioContext.resume().catch(() => {
        // 사용자 제스처 전이라 재생 정책에 막힐 수 있으나 분석 자체는 이어서 시도한다.
      });

      if (isCancelled) {
        return;
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);

      const samples = new Float32Array(analyser.fftSize);

      const measure = () => {
        frameId = requestAnimationFrame(measure);

        const now = performance.now();
        if (now - lastUpdatedAt < UPDATE_INTERVAL_MS) {
          return;
        }
        lastUpdatedAt = now;

        analyser.getFloatTimeDomainData(samples);

        let sumOfSquares = 0;
        for (const sample of samples) {
          sumOfSquares += sample * sample;
        }

        const rms = Math.sqrt(sumOfSquares / samples.length);
        const decibel = rms > 0 ? 20 * Math.log10(rms) : MIN_INPUT_LEVEL_DB;

        setMeasurement({
          microphoneId,
          levelDb: Math.min(MAX_INPUT_LEVEL_DB, Math.max(MIN_INPUT_LEVEL_DB, decibel)),
        });
      };

      measure();
    };

    void start();

    return () => {
      isCancelled = true;
      cancelAnimationFrame(frameId);
      void audioContext?.close().catch(() => {});
      stopStream(stream);
      stream = null;
    };
  }, [microphoneId, isEnabled]);

  const isMeasuring = isEnabled && measurement?.microphoneId === microphoneId;

  return {
    levelDb: isMeasuring ? measurement.levelDb : null,
    isMeasuring,
  };
}
