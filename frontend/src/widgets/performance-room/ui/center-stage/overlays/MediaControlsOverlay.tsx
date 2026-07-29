'use client';

import { cn } from '@/shared/lib/cn';

import { useStageStore } from '../../../model/stageStore';
import { CamIcon, MicIcon } from '../../media-controls/MediaIcons';

interface MediaToggleProps {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onToggle: () => void;
}

function MediaToggle({ icon, label, on, onToggle }: MediaToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={cn(
        'flex items-center gap-2 border bg-black/60 px-3 py-1.5 font-mono text-xs tracking-[0.18em] transition-colors',
        on
          ? 'border-cyan-300/80 text-cyan-100'
          : 'border-white/25 text-zinc-500 hover:text-zinc-300',
      )}
    >
      {icon}
      {label} {on ? 'ON' : 'OFF'}
    </button>
  );
}

export function MediaControlsOverlay() {
  const micOn = useStageStore((state) => state.micOn);
  const camOn = useStageStore((state) => state.camOn);
  const toggleMic = useStageStore((state) => state.toggleMic);
  const toggleCam = useStageStore((state) => state.toggleCam);

  return (
    <div className="absolute left-4 top-4 flex gap-2">
      <MediaToggle icon={<MicIcon />} label="MIC" on={micOn} onToggle={toggleMic} />
      <MediaToggle icon={<CamIcon />} label="CAM" on={camOn} onToggle={toggleCam} />
    </div>
  );
}
