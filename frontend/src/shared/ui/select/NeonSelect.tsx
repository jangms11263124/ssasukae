'use client';

import { cn } from '@/shared/lib/cn';

export interface NeonSelectOption {
  value: string;
  label: string;
}

interface NeonSelectProps {
  id: string;
  label: string;
  value: string;
  options: readonly NeonSelectOption[];
  onChange: (value: string) => void;
  isDisabled?: boolean;
  /** 선택 불가/미지원 사유 등 라벨 아래 보조 설명 */
  hint?: string;
  emptyLabel?: string;
  className?: string;
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NeonSelect({
  id,
  label,
  value,
  options,
  onChange,
  isDisabled = false,
  hint,
  emptyLabel = 'NO_DEVICE_DETECTED',
  className,
}: NeonSelectProps) {
  const hasOptions = options.length > 0;

  return (
    <div className={cn('flex flex-col', className)}>
      <label
        htmlFor={id}
        className="text-[0.58rem] font-bold tracking-[0.16em] text-zinc-500"
      >
        {label}
      </label>

      <div className="relative mt-3">
        <select
          id={id}
          value={value}
          disabled={isDisabled || !hasOptions}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'h-11 w-full appearance-none border border-white/10 bg-black/20 pl-4 pr-10 text-xs tracking-wide text-zinc-100 outline-none transition-colors focus:border-cyan-400/70',
            'disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:text-zinc-600',
          )}
        >
          {hasOptions ? (
            options.map((option) => (
              <option key={option.value} value={option.value} className="bg-[#171717] text-zinc-100">
                {option.label}
              </option>
            ))
          ) : (
            <option value="" className="bg-[#171717] text-zinc-500">
              {emptyLabel}
            </option>
          )}
        </select>

        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2',
            isDisabled || !hasOptions ? 'text-zinc-700' : 'text-zinc-400',
          )}
        >
          <ChevronDownIcon />
        </span>
      </div>

      {hint && (
        <p className="mt-2 text-[0.5rem] tracking-[0.1em] text-zinc-600">{hint}</p>
      )}
    </div>
  );
}
