import type { ReactNode } from 'react';

interface StageMessageProps {
  actions?: ReactNode;
  subtitle?: string;
  title: ReactNode;
}

export function StageMessage({ actions, subtitle, title }: StageMessageProps) {
  return (
    <div className="grid size-full place-items-center px-6 text-center">
      <div>
        <p className="text-2xl text-cyan-200">{title}</p>
        {subtitle ? <p className="mt-3 text-sm text-zinc-500">{subtitle}</p> : null}
        {actions ? <div className="mt-7">{actions}</div> : null}
      </div>
    </div>
  );
}
