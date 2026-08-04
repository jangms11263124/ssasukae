import { getAccessToken } from '@/shared/model/authStore';

const LOW_LATENCY_BACKEND_URL = 'http://192.168.100.91:8080';
const APP_LAUNCH_TIMEOUT_MS = 2_500;

interface LaunchLowLatencyAppOptions {
  onUnavailable?: () => void;
}

export function launchLowLatencyApp(
  roomId: number,
  options: LaunchLowLatencyAppOptions = {},
): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const accessToken = getAccessToken();
  if (!accessToken) {
    return false;
  }

  const backendUrl =
    process.env.NEXT_PUBLIC_API_URL?.trim() || LOW_LATENCY_BACKEND_URL;
  const query = new URLSearchParams({
    roomId: roomId.toString(),
    authToken: accessToken,
    backendUrl,
  });

  let settled = false;
  let timeoutId: number | null = null;
  const cleanup = () => {
    window.removeEventListener('blur', handleAppOpened);
    document.removeEventListener('visibilitychange', handleAppOpened);
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
  const settleAsOpened = () => {
    if (settled) return;
    settled = true;
    cleanup();
  };
  function handleAppOpened() {
    if (document.hidden || !document.hasFocus()) settleAsOpened();
  }

  window.addEventListener('blur', handleAppOpened);
  document.addEventListener('visibilitychange', handleAppOpened);
  timeoutId = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    cleanup();
    options.onUnavailable?.();
  }, APP_LAUNCH_TIMEOUT_MS);

  window.location.href = `ssafystar://low-latency/join?${query.toString()}`;
  return true;
}
