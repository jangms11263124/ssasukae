import { getAccessToken } from '@/shared/model/authStore';

const LOW_LATENCY_BACKEND_URL = 'http://192.168.100.91:8080';

export function launchLowLatencyApp(roomId: number): boolean {
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
  window.location.href = `ssafystar://low-latency/join?${query.toString()}`;
  return true;
}
