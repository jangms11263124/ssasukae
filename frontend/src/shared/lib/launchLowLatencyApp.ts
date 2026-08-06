import { getAccessToken } from '@/shared/model/authStore';

/** 저지연 오디오 앱 설치 파일. 쿼리 버전은 설치 파일 교체 시 브라우저 캐시를 무효화한다. */
export const LOW_LATENCY_APP_DOWNLOAD_URL =
  '/downloads/SSAFYStar-LowLatencyAudio-Setup-x64.msi?v=0.1.8';

export const LOW_LATENCY_APP_FILE_NAME = 'SSAFYStar-LowLatencyAudio-Setup-x64.msi';

/**
 * 앱이 app-session·token refresh·방 이벤트 구독에 쓸 백엔드 origin.
 *
 * 브라우저 API는 Next 라우트 핸들러 프록시를 타지만 네이티브 앱은 프록시를 쓸 수 없고,
 * 앱이 이 주소에서 파생시키는 /ws 업그레이드는 프록시로 통과시킬 수 없어 백엔드에 직접
 * 붙어야 한다. 그래서 프론트 도메인이 아니라 API 도메인을 넘긴다.
 *
 * NEXT_PUBLIC_ 변수는 빌드 시점에 인라인되므로 배포 파이프라인에 값이 없으면 폴백이
 * 그대로 나간다. 배포를 기본값으로 두고 로컬은 .env.local에서 덮어쓴다.
 */
const DEFAULT_BACKEND_URL = 'https://api.ssafystar-k.site';
const APP_LAUNCH_TIMEOUT_MS = 2_500;

export interface LaunchLowLatencyAppOptions {
  /** 앱 화면에 그릴 방 이름 (없으면 앱이 '저지연 방'으로 폴백한다) */
  roomName?: string;
  inviteCode?: string;
  nickname?: string;
  /** 앱으로 포커스가 넘어간 것이 감지됐을 때 */
  onOpened?: () => void;
  /** 제한 시간 안에 앱 전환이 감지되지 않았을 때 (미설치로 간주) */
  onUnavailable?: () => void;
}

/**
 * ssafystar:// 딥링크로 저지연 오디오 앱을 실행한다.
 * 앱은 roomId·authToken만 있으면 방 정보를 백엔드에서 채우므로 나머지 값은 표시용이다.
 *
 * @returns 딥링크를 실제로 호출했는지 여부 (로그인 전이면 false)
 */
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
    process.env.NEXT_PUBLIC_API_URL?.trim() || DEFAULT_BACKEND_URL;
  const query = new URLSearchParams({
    roomId: roomId.toString(),
    authToken: accessToken,
    backendUrl,
  });
  if (options.roomName) query.set('roomName', options.roomName);
  if (options.inviteCode) query.set('inviteCode', options.inviteCode);
  if (options.nickname) query.set('nickname', options.nickname);

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
    options.onOpened?.();
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
