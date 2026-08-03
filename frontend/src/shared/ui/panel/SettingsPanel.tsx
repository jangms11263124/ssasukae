import { anybody } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

interface SettingsPanelProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SettingsPanel({ title, icon, children, className }: SettingsPanelProps) {
  return (
    <section
      className={cn(
        anybody.className,
        'relative border border-white/[0.08] bg-[linear-gradient(135deg,#1d1d1d_0%,#151515_62%,#101010_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_4px,rgba(255,255,255,0.012)_5px)]"
      />

      {/* flex-col: 자식이 flex-1/mt-auto로 하단 고정을 쓸 수 있게 한다. 블록 스택과 시각 결과는 동일 */}
      <div className="relative flex h-full flex-col">
        <h2 className="flex items-center gap-2.5 text-[0.72rem] font-bold tracking-[0.14em] text-zinc-100">
          <span aria-hidden="true" className="text-cyan-400">
            {icon}
          </span>
          {title}
        </h2>

        {children}
      </div>
    </section>
  );
}
