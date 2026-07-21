'use client';

import { cn } from '@/shared/lib/cn';
import { useToastStore } from '@/shared/model/toastStore';

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-4 sm:pt-6"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          role="status"
          onClick={() => dismissToast(toast.id)}
          className={cn(
            'pointer-events-auto w-full max-w-md cursor-pointer rounded-2xl border px-4 py-3 text-center text-sm leading-relaxed shadow-lg backdrop-blur-md transition-opacity',
            toast.exiting ? 'animate-toast-out' : 'animate-toast-in',
            toast.tone === 'error'
              ? 'border-rose-400/35 bg-[#1a0f14]/90 text-rose-100'
              : 'border-white/15 bg-[#12121a]/90 text-zinc-100',
          )}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
