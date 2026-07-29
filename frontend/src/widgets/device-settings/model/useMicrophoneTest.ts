'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { applyAudioSinkId, openMicrophoneStream, stopStream } from '../lib/mediaStream';

/** 'preparing'은 마이크를 여는 중으로, 아직 녹음이 시작되지 않은 구간이다. */
export type MicrophoneTestPhase = 'idle' | 'preparing' | 'recording' | 'playing';

export const RECORD_DURATION_MS = 2000;
/** 남은 시간을 막대로 보여주므로 눈에 끊겨 보이지 않을 만큼 촘촘히 갱신한다. */
const COUNTDOWN_TICK_MS = 50;

interface UseMicrophoneTestParams {
  microphoneId: string;
  speakerId: string;
  /** 0 ~ 100 */
  outputVolume: number;
}

/** 마이크로 짧게 녹음한 뒤 선택된 출력 기기로 되들려준다. */
export function useMicrophoneTest({
  microphoneId,
  speakerId,
  outputVolume,
}: UseMicrophoneTestParams) {
  const [phase, setPhase] = useState<MicrophoneTestPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(RECORD_DURATION_MS);

  const isMountedRef = useRef(true);
  const stopTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackUrlRef = useRef<string | null>(null);

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const releasePlayback = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;

    if (playbackUrlRef.current) {
      URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (stopTimerRef.current !== null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }

      clearCountdown();
      releasePlayback();
    };
  }, [clearCountdown, releasePlayback]);

  const startTest = useCallback(async () => {
    if (phase !== 'idle') {
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      setErrorMessage('이 브라우저는 마이크 테스트(녹음)를 지원하지 않습니다.');
      return;
    }

    setErrorMessage(null);
    // 마이크가 열리기 전까지는 'preparing'으로 둔다.
    // 여기서 바로 'recording'으로 넘기면 기기 여는 시간이 녹음 시간에 얹혀 보인다.
    setPhase('preparing');

    let stream: MediaStream | null = null;

    try {
      stream = await openMicrophoneStream(microphoneId);
    } catch {
      setPhase('idle');
      setErrorMessage('마이크를 열 수 없습니다. 권한과 기기 연결을 확인해 주세요.');
      return;
    }

    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];

    const playRecording = async (recorded: Blob) => {
      const url = URL.createObjectURL(recorded);
      const audio = new Audio(url);

      playbackUrlRef.current = url;
      audioRef.current = audio;
      audio.volume = outputVolume / 100;

      await applyAudioSinkId(audio, speakerId);

      audio.addEventListener('ended', () => {
        releasePlayback();

        if (isMountedRef.current) {
          setPhase('idle');
        }
      });

      setPhase('playing');

      try {
        await audio.play();
      } catch {
        releasePlayback();

        if (isMountedRef.current) {
          setPhase('idle');
          setErrorMessage('녹음을 재생할 수 없습니다.');
        }
      }
    };

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    recorder.addEventListener('stop', () => {
      clearCountdown();
      stopStream(stream);
      stream = null;

      if (!isMountedRef.current) {
        return;
      }

      if (chunks.length === 0) {
        setPhase('idle');
        setErrorMessage('녹음된 소리가 없습니다. 마이크 입력을 확인해 주세요.');
        return;
      }

      void playRecording(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    });

    recorder.start();

    // 실제 녹음이 시작된 지금부터 RECORD_DURATION_MS를 센다.
    setPhase('recording');
    setRemainingMs(RECORD_DURATION_MS);

    // setInterval은 호출 간격이 밀릴 수 있으므로, 누적 차감이 아니라
    // 종료 시각과의 차이로 남은 시간을 계산해 실제 경과 시간과 어긋나지 않게 한다.
    const recordingEndsAt = performance.now() + RECORD_DURATION_MS;

    countdownTimerRef.current = window.setInterval(() => {
      const remaining = Math.max(0, recordingEndsAt - performance.now());

      setRemainingMs(remaining);

      if (remaining === 0) {
        clearCountdown();
      }
    }, COUNTDOWN_TICK_MS);

    stopTimerRef.current = window.setTimeout(() => {
      stopTimerRef.current = null;

      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    }, RECORD_DURATION_MS);
  }, [clearCountdown, microphoneId, outputVolume, phase, releasePlayback, speakerId]);

  return { phase, errorMessage, remainingMs, startTest };
}
