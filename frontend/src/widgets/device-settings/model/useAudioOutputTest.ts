'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { applyAudioSinkId } from '../lib/mediaStream';

const TEST_TONE_HZ = 440;
const TEST_TONE_SECONDS = 0.9;
const FADE_SECONDS = 0.06;
const TONE_PEAK_GAIN = 0.25;

interface UseAudioOutputTestParams {
  speakerId: string;
  /** 0 ~ 100 */
  outputVolume: number;
}

/**
 * 테스트음을 선택된 출력 기기로 재생한다.
 *
 * setSinkId는 HTMLMediaElement에만 있으므로, AudioContext로 만든 톤을
 * MediaStreamDestination을 거쳐 <audio> 요소에 물린 뒤 기기를 지정한다.
 */
export function useAudioOutputTest({ speakerId, outputVolume }: UseAudioOutputTestParams) {
  const [isPlaying, setIsPlaying] = useState(false);

  const isMountedRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const release = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }

    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      release();
    };
  }, [release]);

  const playTestTone = useCallback(async () => {
    if (isPlaying) {
      return;
    }

    setIsPlaying(true);

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    const destination = audioContext.createMediaStreamDestination();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = TEST_TONE_HZ;

    // 톤을 그대로 켜고 끄면 클릭 노이즈가 나므로 앞뒤로 짧은 페이드를 준다.
    const startedAt = audioContext.currentTime;
    const endedAt = startedAt + TEST_TONE_SECONDS;

    gain.gain.setValueAtTime(0, startedAt);
    gain.gain.linearRampToValueAtTime(TONE_PEAK_GAIN, startedAt + FADE_SECONDS);
    gain.gain.setValueAtTime(TONE_PEAK_GAIN, endedAt - FADE_SECONDS);
    gain.gain.linearRampToValueAtTime(0, endedAt);

    oscillator.connect(gain).connect(destination);

    const audio = new Audio();
    audio.srcObject = destination.stream;
    audio.volume = outputVolume / 100;
    audioRef.current = audio;

    await applyAudioSinkId(audio, speakerId);

    try {
      await audio.play();
    } catch {
      release();

      if (isMountedRef.current) {
        setIsPlaying(false);
      }

      return;
    }

    oscillator.start(startedAt);
    oscillator.stop(endedAt);

    stopTimerRef.current = window.setTimeout(() => {
      stopTimerRef.current = null;
      release();

      if (isMountedRef.current) {
        setIsPlaying(false);
      }
    }, TEST_TONE_SECONDS * 1000 + 150);
  }, [isPlaying, outputVolume, release, speakerId]);

  return { isPlaying, playTestTone };
}
