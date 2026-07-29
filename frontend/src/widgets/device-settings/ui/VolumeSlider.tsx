'use client';

import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

interface VolumeSliderProps {
  id: string;
  label: string;
  /** 0 ~ 100 */
  value: number;
  onChange: (value: number) => void;
}

export function VolumeSlider({ id, label, value, onChange }: VolumeSliderProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={id} className="text-[0.58rem] font-bold tracking-[0.16em] text-zinc-500">
          {label}
        </label>
        <span
          className={cn(
            jetBrainsMono.className,
            'text-[0.62rem] font-bold tracking-[0.1em] text-cyan-400',
          )}
        >
          {value}%
        </span>
      </div>

      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        // 채워진 구간은 트랙 배경 그라디언트로 표현한다. ::-webkit-slider-runnable-track을
        // 따로 스타일링하면 thumb의 수직 정렬이 브라우저마다 어긋난다.
        style={{
          background: `linear-gradient(to right, var(--color-neon-cyan) ${value}%, rgba(255,255,255,0.08) ${value}%)`,
        }}
        className={cn(
          'mt-4 h-0.5 w-full cursor-pointer appearance-none outline-none',
          'focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-cyan-300',
          '[&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(34,211,238,0.6)]',
          '[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white',
        )}
      />
    </div>
  );
}
