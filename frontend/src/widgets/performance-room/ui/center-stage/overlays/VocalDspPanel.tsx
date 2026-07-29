import { cn } from '@/shared/lib/cn';

// 보컬 DSP 목업 패널. 오디오 엔진 연동 시 실제 파라미터 상태와 조작 UI로 교체한다.
const DSP_PARAMS = [
  { accent: true, label: '음정', value: '+2 Key' },
  { accent: false, label: '템포', value: '0 Key' },
  { accent: false, label: '에코', value: '30%' },
  { accent: false, label: '음량', value: '80%' },
] as const;

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
}

export function VocalDspPanel({ onClose }: VocalDspPanelProps) {
  return (
    <aside
      aria-label="보컬 DSP 제어 랙"
      className="absolute right-4 top-4 w-56 rounded-2xl border border-white/15 bg-[#1b1b1f]/90 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur-sm"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-white">보컬 DSP 제어 랙</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="보컬 DSP 제어 랙 닫기"
          className="grid size-7 place-items-center rounded-lg border border-red-400/60 bg-red-500/15 text-red-300 transition-colors hover:bg-red-500/30 hover:text-red-200"
        >
          <CloseIcon />
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {DSP_PARAMS.map((param) => (
          <li
            key={param.label}
            className={cn(
              'flex items-center justify-between rounded-xl border px-4 py-2.5 text-[13px]',
              param.accent
                ? 'border-pink-400/90 bg-gradient-to-r from-fuchsia-600/90 to-pink-500/70 text-white shadow-[0_0_14px_rgba(232,121,249,0.45)]'
                : 'border-white/10 bg-[#26262b] text-zinc-200',
            )}
          >
            <span className="font-semibold">{param.label}</span>
            <span className="font-mono font-bold">{param.value}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="mt-3 w-full rounded-xl border border-white/25 bg-white/[0.04] py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-cyan-300/50 hover:text-cyan-200"
      >
        전체 파라미터 초기화
      </button>
    </aside>
  );
}
