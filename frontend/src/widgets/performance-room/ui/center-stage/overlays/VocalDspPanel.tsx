'use client';

import { DEFAULT_PERFORMANCE_SETTINGS } from '@/entities/performance';
import { cn } from '@/shared/lib/cn';

import { DSP_ROWS, SOUND_PANEL_LABEL } from '../../../config/dspParams';
import { useSettingsPublisher } from '../../../model/useSettingsPublisher';
import { useStageStore } from '../../../model/stageStore';

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="size-3.5"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

interface VocalDspPanelProps {
  onClose: () => void;
  /** 제스처로 조준 중인 행 */
  activeRowIndex?: number | null;
  /** 제스처로 값을 잡고 있는 행 */
  grabbedRowIndex?: number | null;
}

export function VocalDspPanel({
  onClose,
  activeRowIndex = null,
  grabbedRowIndex = null,
}: VocalDspPanelProps) {
  const settings = useStageStore((state) => state.settings);
  const publishSettings = useSettingsPublisher();

  return (
    <aside
      aria-label={`${SOUND_PANEL_LABEL} 패널`}
      // 손 인식은 무대 전체를 4등분해 카드 위치와 1:1로 맞지 않는다. 잡은 항목은 강조 색으로 알린다.
      // backdrop-blur는 좌우 반전된 캠 영상과 합성되며 무대 색을 바꿔 버려 쓰지 않는다.
      className="absolute right-4 top-[14%] w-[188px] overflow-hidden rounded-2xl border-[1.5px] border-cyan-300/45 bg-[#0c101e]/85 shadow-[0_15px_50px_rgba(0,0,0,0.65),0_0_25px_rgba(0,243,255,0.35)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/35 px-3 py-2">
        <p className="text-[13px] font-black tracking-tight text-white drop-shadow-[0_0_10px_rgba(0,243,255,0.55)]">
          {SOUND_PANEL_LABEL}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => publishSettings(DEFAULT_PERFORMANCE_SETTINGS)}
            // 높이는 옆 닫기 버튼과 같게 맞춘다. 한글 글자가 줄 상자 위쪽에 붙는
            // 폰트라, 위아래 여백을 같게 주면 떠 보여 위쪽만 조금 더 준다.
            className="flex h-[22px] items-center rounded-md border border-white/25 bg-white/10 px-2 pt-[2px] text-[10px] font-extrabold leading-none text-white transition-colors hover:border-cyan-300/70 hover:text-cyan-200"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={`${SOUND_PANEL_LABEL} 패널 닫기`}
            className="grid size-[22px] place-items-center rounded-md border border-[#ff3b30]/60 bg-[#ff3b30]/20 text-[#ff3b30] transition-all hover:bg-[#ff3b30] hover:text-white hover:shadow-[0_0_15px_#ff3b30]"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <ul className="flex flex-col gap-2 p-3">
        {DSP_ROWS.map((row, index) => {
          const isGrabbed = index === grabbedRowIndex;
          const isActive = index === activeRowIndex;

          return (
            <li
              key={row.key}
              // 크기를 바꾸면 카드가 흔들려 보여서 색과 글로우로만 표시한다.
              className={cn(
                'flex items-center justify-between gap-2 rounded-xl border-[1.5px] px-3 py-3 transition-colors duration-200',
                isGrabbed
                  ? 'border-[#ff007f] bg-gradient-to-br from-[#ff007f]/50 to-[#9d4edd]/50 shadow-[0_0_24px_rgba(255,0,127,0.55)]'
                  : isActive
                    ? 'border-cyan-300 bg-cyan-300/25 shadow-[0_0_20px_rgba(0,243,255,0.45)]'
                    : 'border-white/25 bg-[#12182a]/65',
              )}
            >
              {/* leading-none을 주면 한글이 박스 위쪽에 붙어 숫자와 어긋난다 */}
              <span
                className={cn(
                  'text-xs font-black leading-normal text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]',
                  isGrabbed && 'drop-shadow-[0_0_12px_rgba(255,0,127,0.95)]',
                  isActive && !isGrabbed && 'drop-shadow-[0_0_12px_rgba(0,243,255,0.95)]',
                )}
              >
                {row.label}
              </span>
              <span
                className={cn(
                  'font-mono text-xs font-black leading-normal tabular-nums text-zinc-50 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]',
                  isGrabbed && 'drop-shadow-[0_0_14px_rgba(255,0,127,0.95)]',
                  isActive && !isGrabbed && 'drop-shadow-[0_0_14px_rgba(0,243,255,0.95)]',
                )}
              >
                {row.format(row.read(settings))}
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}