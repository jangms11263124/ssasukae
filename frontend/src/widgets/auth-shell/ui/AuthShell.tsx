import { cn } from '@/shared/lib/cn';

interface AuthShellProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthShell({ children, className }: AuthShellProps) {
  return (
    <div
      className={cn(
        'relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#0a0a12] px-5 py-12',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(168,85,247,0.22),transparent_55%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_80%,rgba(34,211,238,0.1),transparent_45%)]"
      />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}
