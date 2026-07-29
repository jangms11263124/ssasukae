'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { EMPTY_DEVICE_GROUPS, groupDevices } from '../lib/groupDevices';
import { isAudioOutputSelectionSupported, isMediaDevicesSupported } from '../lib/mediaSupport';
import type { MediaDeviceGroups, MediaPermissionStatus } from '../types';

interface PermissionProbeResult {
  status: MediaPermissionStatus;
  errorMessage: string | null;
}

// 브라우저 지원 여부는 런타임 내내 바뀌지 않으므로 구독은 비워 두고 스냅샷만 읽는다.
// useSyncExternalStore를 쓰면 서버 렌더 값을 따로 지정할 수 있어 하이드레이션 불일치가 없다.
const subscribeToNothing = () => () => {};
const getAudioOutputSupport = () => isAudioOutputSelectionSupported();
const getAudioOutputSupportOnServer = () => false;

/**
 * 카메라·마이크 권한을 확보한다. 여기서 여는 스트림은 권한 확인 전용이라 즉시 정리하고,
 * 실제 프리뷰·레벨 측정용 스트림은 각 기능 훅이 따로 연다.
 *
 * 상태를 직접 갱신하지 않고 결과만 돌려주므로, 호출부는 await 이후에 setState 할 수 있다.
 */
async function probeMediaPermission(): Promise<PermissionProbeResult> {
  if (!isMediaDevicesSupported()) {
    return {
      status: 'unsupported',
      errorMessage:
        '이 브라우저에서는 카메라·마이크를 사용할 수 없습니다. HTTPS 환경에서 접속해 주세요.',
    };
  }

  let probeStream: MediaStream | null = null;

  try {
    probeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

    return { status: 'granted', errorMessage: null };
  } catch {
    try {
      // 카메라와 마이크 중 하나만 연결된 환경도 있으므로 오디오만으로 한 번 더 시도한다.
      probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      return { status: 'granted', errorMessage: null };
    } catch {
      return {
        status: 'denied',
        errorMessage:
          '카메라·마이크 권한이 거부되었습니다. 브라우저 주소창의 권한 설정에서 허용해 주세요.',
      };
    }
  } finally {
    probeStream?.getTracks().forEach((track) => track.stop());
  }
}

/**
 * 미디어 기기 목록과 권한 상태를 관리한다.
 *
 * enumerateDevices()는 권한을 얻기 전에는 label을 빈 문자열로 돌려주기 때문에,
 * 기기 이름을 표시하려면 먼저 권한을 확보한 뒤 다시 열거해야 한다.
 */
export function useMediaDevices() {
  // 마운트 직후 곧바로 권한을 요청하므로 초기값부터 'requesting'으로 둔다.
  const [permission, setPermission] = useState<MediaPermissionStatus>('requesting');
  const [devices, setDevices] = useState<MediaDeviceGroups>(EMPTY_DEVICE_GROUPS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSelectAudioOutput = useSyncExternalStore(
    subscribeToNothing,
    getAudioOutputSupport,
    getAudioOutputSupportOnServer,
  );

  const refreshDevices = useCallback(async () => {
    if (!isMediaDevicesSupported()) {
      return;
    }

    try {
      setDevices(groupDevices(await navigator.mediaDevices.enumerateDevices()));
    } catch {
      setDevices(EMPTY_DEVICE_GROUPS);
    }
  }, []);

  const applyProbeResult = useCallback(
    async (result: PermissionProbeResult) => {
      setPermission(result.status);
      setErrorMessage(result.errorMessage);
      await refreshDevices();
    },
    [refreshDevices],
  );

  const requestPermission = useCallback(async () => {
    setPermission('requesting');
    setErrorMessage(null);

    await applyProbeResult(await probeMediaPermission());
  }, [applyProbeResult]);

  useEffect(() => {
    let isCancelled = false;

    const requestOnMount = async () => {
      const result = await probeMediaPermission();

      if (!isCancelled) {
        await applyProbeResult(result);
      }
    };

    void requestOnMount();

    return () => {
      isCancelled = true;
    };
  }, [applyProbeResult]);

  useEffect(() => {
    if (!isMediaDevicesSupported()) {
      return;
    }

    const handleDeviceChange = () => {
      void refreshDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshDevices]);

  return {
    devices,
    permission,
    errorMessage,
    canSelectAudioOutput,
    requestPermission,
  };
}
