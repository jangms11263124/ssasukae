'use client';

import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

import { useStageStore } from '../../model/stageStore';
import { CamIcon, MicIcon } from './MediaIcons';

interface ControlToggleProps {
  icon: ReactNode;
  label: string;
  on: boolean;
  onToggle: () => void;
}

function ControlToggle({ icon, label, on, onToggle }: ControlToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={`${label} ${on ? '끄기' : '켜기'}`}
      className="group flex flex-col items-center gap-2.5"
    >
      <span
        className={cn(
          'grid size-11 place-items-center border transition-colors',
          on
            ? 'border-white bg-white text-black'
            : 'border-white/30 bg-white/5 text-white group-hover:border-white/60',
        )}
      >
        {icon}
      </span>
      <span className="font-mono text-xs tracking-[0.18em] text-zinc-300 transition-colors group-hover:text-white">
        {label} {on ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}

export function MediaControlDock() {
  const micOn = useStageStore((state) => state.micOn);
  const camOn = useStageStore((state) => state.camOn);
  const toggleMic = useStageStore((state) => state.toggleMic);
  const toggleCam = useStageStore((state) => state.toggleCam);

  return (
    <div className="flex items-center justify-center gap-12 border border-white/10 bg-[#151517] px-6 py-5">
      <ControlToggle icon={<MicIcon className="size-5" />} label="MIC" on={micOn} onToggle={toggleMic} />
      <ControlToggle icon={<CamIcon className="size-5" />} label="CAM" on={camOn} onToggle={toggleCam} />
    </div>
  );
}
