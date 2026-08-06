'use client';

import { useState } from 'react';

import { useRoomStore } from '@/entities/room';
import { cn } from '@/shared/lib/cn';

import { TEMPO_STEP_PERCENT } from '../../config/dspParams';
import { useSettingsPublisher } from '../../model/useSettingsPublisher';
import { useStageStore } from '../../model/stageStore';
import { RoomPanel } from '../RoomPanel';

const SHIFT_MIN = -6;
const SHIFT_MAX = 6;

function FaderIcon() {
  return (
    <svg
      aria-hidden
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
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
  value: number;
}

function SliderRow({ disabled = false, label, onChange, value }: SliderRowProps) {
  return (
    <div className={disabled ? 'opacity-50' : undefined}>
      <div className="flex items-center justify-between font-mono text-xs tracking-[0.12em]">
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-400">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        className="mt-2 h-1 w-full cursor-pointer appearance-none disabled:cursor-not-allowed [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-white"
        style={{
          background: `linear-gradient(to right, #67e8f9 ${value}%, rgba(255,255,255,0.12) ${value}%)`,
        }}
      />
    </div>
  );
}

interface StepperRowProps {
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
  value: number;
}

function StepperRow({ disabled = false, label, onChange, value }: StepperRowProps) {
  return (
    <div className={disabled ? 'flex items-center justify-between opacity-50' : 'flex items-center justify-between'}>
      <span className="font-mono text-xs tracking-[0.12em] text-zinc-300">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`${label} 낮추기`}
          disabled={disabled || value <= SHIFT_MIN}
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
          disabled={disabled || value >= SHIFT_MAX}
          onClick={() => onChange(Math.min(SHIFT_MAX, value + 1))}
          className="grid size-7 place-items-center border border-white/25 text-sm text-zinc-300 transition-colors hover:border-cyan-300/60 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

/** 대기 시 접힘, 가창(READY/PERFORMING) 시 자동 펼침 — `inline` 전용 */
export function AudioEnginePanel({ variant = 'inline' }: { variant?: 'inline' | 'dock' }) {
  const settings = useStageStore((state) => state.settings);
  const publishSettings = useSettingsPublisher();
  const phase = useStageStore((state) => state.phase);
  const isBattleMode = useRoomStore((state) => state.session?.mode === 'BATTLE');
  const myParticipantId = useRoomStore((state) => state.session?.myParticipantId);
  const performerParticipantId = useStageStore((state) => state.performerParticipantId);
  const isPerformer =
    myParticipantId !== undefined && myParticipantId === performerParticipantId;
  const locked = !isPerformer;

  const shouldAutoExpand = phase === 'PERFORMING' || (isPerformer && phase === 'READY');
  const [expanded, setExpanded] = useState(shouldAutoExpand);
  const [autoExpandSnapshot, setAutoExpandSnapshot] = useState(shouldAutoExpand);

  if (variant === 'inline' && shouldAutoExpand !== autoExpandSnapshot) {
    setAutoExpandSnapshot(shouldAutoExpand);
    setExpanded(shouldAutoExpand);
  }

  const mrVolume = settings.mrVolumePercent;
  const echo = settings.echoLevel;
  const monitorVoice = settings.monitorVoicePercent;
  const pitchShift = settings.keyOffset;
  const tempoShift = Math.round((settings.tempoPercent - 100) / TEMPO_STEP_PERCENT);

  const setMrVolume = (value: number) => publishSettings({ mrVolumePercent: value });
  const setEcho = (value: number) => publishSettings({ echoLevel: value });
  // 로컬 전용 값 — 서버 계약(4필드)에 없어 전송 시 걸러지고, 가창자 이어폰에만 반영된다.
  const setMonitorVoice = (value: number) => publishSettings({ monitorVoicePercent: value });
  const setPitchShift = (value: number) => publishSettings({ keyOffset: value });
  const setTempoShift = (value: number) =>
    publishSettings({ tempoPercent: 100 + value * TEMPO_STEP_PERCENT });

  const controls = (
    <div className="space-y-4 px-4 pb-4 pt-3">
      <SliderRow label="MR VOLUME" value={mrVolume} onChange={setMrVolume} disabled={locked} />
      <SliderRow label="ECHO" value={echo} onChange={setEcho} disabled={locked} />
      <SliderRow label="MY VOICE" value={monitorVoice} onChange={setMonitorVoice} disabled={locked} />
      {!isBattleMode ? (
        <>
          <StepperRow
            label="PITCH SHIFT"
            value={pitchShift}
            onChange={setPitchShift}
            disabled={locked}
          />
          <StepperRow
            label="TEMPO SHIFT"
            value={tempoShift}
            onChange={setTempoShift}
            disabled={locked}
          />
        </>
      ) : null}

      {locked ? (
        <p className="font-mono text-[10px] tracking-[0.12em] text-zinc-500">
          가창자만 조절할 수 있습니다
        </p>
      ) : null}
    </div>
  );

  if (variant === 'dock') {
    return <div className="px-4 py-3">{controls}</div>;
  }

  return (
    <RoomPanel
      className={cn('shrink-0', !expanded && 'border-dashed border-white/20 bg-transparent')}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-cyan-300">
          <FaderIcon />
          오디오 설정
        </span>
        <span className="text-[11px] text-zinc-500">
          {expanded ? '접기' : '가창 시 펼침'}
        </span>
      </button>

      {expanded ? <div className="border-t border-white/10">{controls}</div> : null}
    </RoomPanel>
  );
}
