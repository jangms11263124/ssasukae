import { create } from 'zustand';

export type ToastTone = 'error' | 'info' | 'success';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  exiting: boolean;
}

interface ToastStore {
  toasts: ToastItem[];
  showToast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: string) => void;
}

const EXIT_MS = 320;
const AUTO_DISMISS_MS = 4000;

const dismissTimers = new Map<string, number>();

function clearDismissTimer(id: string) {
  const timer = dismissTimers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    dismissTimers.delete(id);
  }
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  showToast: (message, tone = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    set((state) => ({
      toasts: [...state.toasts, { id, message, tone, exiting: false }],
    }));

    const timer = window.setTimeout(() => {
      get().dismissToast(id);
    }, AUTO_DISMISS_MS);

    dismissTimers.set(id, timer);
  },
  dismissToast: (id) => {
    const toast = get().toasts.find((item) => item.id === id);
    if (!toast || toast.exiting) {
      return;
    }

    clearDismissTimer(id);

    set((state) => ({
      toasts: state.toasts.map((item) =>
        item.id === id ? { ...item, exiting: true } : item,
      ),
    }));

    window.setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((item) => item.id !== id),
      }));
    }, EXIT_MS);
  },
}));

export function showToast(message: string, tone: ToastTone = 'info') {
  useToastStore.getState().showToast(message, tone);
}
