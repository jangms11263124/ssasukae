'use client';

import { useEffect, useRef } from 'react';

import type { PerformanceSettings } from '@/entities/performance';

import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useStageStore } from '../../model/stageStore';
import { RoomPanel } from '../RoomPanel';

const SHIFT_MIN = -6;
const SHIFT_MAX = 6;

function FaderIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="size-4"
    >
      <path d="M6 4v16M12 4v16M18 4v16" />
      <rect x="4.4" y="8" width="3.2" height="3.2" fill="currentColor" stroke="none" />
      <rect x="10.4" y="13" width="3.2" height="3.2" fill="currentColor" stroke="none" />
      <rect x="16.4" y="6" width="3.2" height="3.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface SliderRowProps {
  label: string;
  onChange: (value: number) => void;
  value: number;
}

function SliderRow({ label, onChange, value }: SliderRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-xs tracking-[0.12em]">
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-400">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        className="mt-2 h-1 w-full cursor-pointer appearance-none [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-white"
        style={{
          background: `linear-gradient(to right, #67e8f9 ${value}%, rgba(255,255,255,0.12) ${value}%)`,
        }}
      />
    </div>
  );
}

interface StepperRowProps {
  label: string;
  onChange: (value: number) => void;
  value: number;
}

function StepperRow({ label, onChange, value }: StepperRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-xs tracking-[0.12em] text-zinc-300">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`${label} 낮추기`}
          disabled={value <= SHIFT_MIN}
          onClick={() => onChange(Math.max(SHIFT_MIN, value - 1))}
          className="grid size-7 place-items-center border border-white/25 text-sm text-zinc-300 transition-colors hover:border-cyan-300/60 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          -
        </button>
        <span className="grid size-7 place-items-center border border-white/15 bg-white/5 font-mono text-xs text-zinc-100">
          {value}
        </span>
        <button
          type="button"
          aria-label={`${label} 높이기`}
          disabled={value >= SHIFT_MAX}
          onClick={() => onChange(Math.min(SHIFT_MAX, value + 1))}
          className="grid size-7 place-items-center border border-white/25 text-sm text-zinc-300 transition-colors hover:border-cyan-300/60 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

// 템포 스테퍼 한 칸(-6~+6)을 백엔드 tempoPercent(50~150)로 변환하는 배율.
const TEMPO_STEP_PERCENT = 5;

const SETTINGS_PUBLISH_DEBOUNCE_MS = 400;

// 값은 stageStore.settings(서버 동기화 상태)를 따르고,
// 변경 시 공연이 진행 중이면 설정 변경 SEND를 디바운스해 발행한다.
export function AudioEnginePanel() {
  const settings = useStageStore((state) => state.settings);
  const applySettingsChanged = useStageStore((state) => state.applySettingsChanged);
  const socket = useRoomSocketContext();
  const publishTimerRef = useRef<number | null>(null);

  const mrVolume = settings.mrVolumePercent;
  const echo = settings.echoLevel;
  const pitchShift = settings.keyOffset;
  const tempoShift = Math.round((settings.tempoPercent - 100) / TEMPO_STEP_PERCENT);

  useEffect(() => {
    return () => {
      if (publishTimerRef.current !== null) {
        window.clearTimeout(publishTimerRef.current);
      }
    };
  }, []);

  const updateSettings = (patch: Partial<PerformanceSettings>) => {
    const next = { ...useStageStore.getState().settings, ...patch };
    applySettingsChanged(next);

    if (publishTimerRef.current !== null) {
      window.clearTimeout(publishTimerRef.current);
    }

    publishTimerRef.current = window.setTimeout(() => {
      publishTimerRef.current = null;

      // 공연(performanceId)이 없으면 로컬 프리셋으로만 유지한다.
      if (useStageStore.getState().performanceId !== null) {
        socket.sendSettings(useStageStore.getState().settings);
      }
    }, SETTINGS_PUBLISH_DEBOUNCE_MS);
  };

  const setMrVolume = (value: number) => updateSettings({ mrVolumePercent: value });
  const setEcho = (value: number) => updateSettings({ echoLevel: value });
  const setPitchShift = (value: number) => updateSettings({ keyOffset: value });
  const setTempoShift = (value: number) =>
    updateSettings({ tempoPercent: 100 + value * TEMPO_STEP_PERCENT });

  return (
    <RoomPanel className="px-4 py-4">
      <h2 className="flex items-center justify-between border-b border-white/15 pb-2">
        <span className="text-sm font-bold tracking-[0.08em] text-cyan-300">AUDIO ENGINE</span>
        <span className="text-zinc-400">
          <FaderIcon />
        </span>
      </h2>

      <div className="mt-4 space-y-4">
        <SliderRow label="MR VOLUME" value={mrVolume} onChange={setMrVolume} />
        <SliderRow label="ECHO" value={echo} onChange={setEcho} />
        <StepperRow label="PITCH SHIFT" value={pitchShift} onChange={setPitchShift} />
        <StepperRow label="TEMPO SHIFT" value={tempoShift} onChange={setTempoShift} />
      </div>
    </RoomPanel>
  );
}
