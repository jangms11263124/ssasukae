import { MAX_INPUT_LEVEL_DB, MIN_INPUT_LEVEL_DB } from '@/entities/media-device';
import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

const SEGMENT_COUNT = 12;
/** 이 구간부터는 클리핑 위험이 있어 경고 색으로 표시한다. */
const CLIPPING_SEGMENT_INDEX = 10;

interface InputLevelMeterProps {
  levelDb: number | null;
  isMeasuring: boolean;
}

function toLitSegmentCount(levelDb: number | null) {
  if (levelDb === null) {
    return 0;
  }

  const ratio = (levelDb - MIN_INPUT_LEVEL_DB) / (MAX_INPUT_LEVEL_DB - MIN_INPUT_LEVEL_DB);

  return Math.round(Math.min(1, Math.max(0, ratio)) * SEGMENT_COUNT);
}

export function InputLevelMeter({ levelDb, isMeasuring }: InputLevelMeterProps) {
  const litSegmentCount = toLitSegmentCount(levelDb);

  return (
    <div className="mt-7">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[0.58rem] font-bold tracking-[0.16em] text-zinc-500">INPUT LEVEL</p>
        <p
          className={cn(
            jetBrainsMono.className,
            'text-[0.62rem] font-bold tracking-[0.1em]',
            isMeasuring ? 'text-cyan-400' : 'text-zinc-600',
          )}
          aria-live="off"
        >
          {levelDb === null ? '--- dB' : `${Math.round(levelDb)} dB`}
        </p>
      </div>

      <div
        role="meter"
        aria-label="마이크 입력 레벨"
        aria-valuemin={MIN_INPUT_LEVEL_DB}
        aria-valuemax={MAX_INPUT_LEVEL_DB}
        aria-valuenow={levelDb ?? MIN_INPUT_LEVEL_DB}
        className="mt-3 flex items-center gap-1"
      >
        {Array.from({ length: SEGMENT_COUNT }, (_, index) => {
          const isLit = index < litSegmentCount;
          const isClippingZone = index >= CLIPPING_SEGMENT_INDEX;

          return (
            <span
              key={index}
              className={cn(
                'h-0.5 flex-1 transition-colors',
                !isLit && 'bg-white/[0.07]',
                isLit &&
                  (isClippingZone
                    ? 'bg-fuchsia-400 shadow-[0_0_6px_rgba(232,121,249,0.7)]'
                    : 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]'),
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
