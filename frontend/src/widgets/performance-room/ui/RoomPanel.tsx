import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

interface RoomPanelProps {
  children: ReactNode;
  className?: string;
}

export function RoomPanel({ children, className }: RoomPanelProps) {
  return (
    <section
      className={cn(
        'border border-white/10 bg-[linear-gradient(145deg,rgba(27,27,31,0.98),rgba(13,13,15,0.98))]',
        'shadow-[0_18px_45px_rgba(0,0,0,0.28)]',
        className,
      )}
    >
      {children}
    </section>
  );
}
