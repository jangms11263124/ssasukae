import { cn } from '@/shared/lib/cn';

type Accent = 'cyan' | 'fuchsia' | 'amber';

const ACCENT_CLASS: Record<Accent, { border: string; label: string; iconBox: string }> = {
  cyan: {
    border: 'border-l-cyan-300/70',
    label: 'text-cyan-300',
    iconBox: 'border-cyan-300/40 text-cyan-300',
  },
  fuchsia: {
    border: 'border-l-fuchsia-400/70',
    label: 'text-fuchsia-400',
    iconBox: 'border-fuchsia-400/40 text-fuchsia-400',
  },
  amber: {
    border: 'border-l-amber-300/70',
    label: 'text-amber-300',
    iconBox: 'border-amber-300/40 text-amber-300',
  },
};

interface InsightPanelProps {
  label: string;
  accent: Accent;
  icon: React.ReactNode;
  /** AI 분석 텍스트. 분석 전이면 null */
  text: string | null;
  className?: string;
}

export function InsightPanel({ label, accent, icon, text, className }: InsightPanelProps) {
  const tone = ACCENT_CLASS[accent];

  return (
    <section
      className={cn(
        'border border-white/[0.08] border-l-2 bg-[#121214] p-6',
        tone.border,
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn('flex size-8 items-center justify-center border bg-black/30', tone.iconBox)}
        >
          {icon}
        </span>
        <h2 className={cn('font-mono text-[0.65rem] font-bold tracking-[0.24em]', tone.label)}>
          {label}
        </h2>
      </div>

      {text ? (
        <p className="mt-5 border border-white/[0.06] bg-black/30 p-4 text-[0.82rem] leading-relaxed text-zinc-300">
          &ldquo;{text}&rdquo;
        </p>
      ) : (
        <p className="mt-5 border border-white/[0.06] bg-black/30 p-4 font-mono text-[0.62rem] tracking-[0.14em] text-zinc-600">
          ANALYSIS_PENDING...
        </p>
      )}
    </section>
  );
}
