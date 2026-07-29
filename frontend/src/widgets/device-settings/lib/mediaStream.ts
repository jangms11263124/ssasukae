/**
 * 저장된 deviceId는 USB 기기 분리·브라우저 프로필 변경 등으로 언제든 무효가 될 수 있다.
 * `exact` 제약이 깨지면 기본 기기로 폴백해 화면이 빈 상태로 남지 않게 한다.
 */
async function openWithFallback(
  deviceId: string,
  toConstraints: (id?: string) => MediaStreamConstraints,
): Promise<MediaStream> {
  if (!deviceId) {
    return navigator.mediaDevices.getUserMedia(toConstraints());
  }

  try {
    return await navigator.mediaDevices.getUserMedia(toConstraints(deviceId));
  } catch (error) {
    if (error instanceof Error && error.name === 'OverconstrainedError') {
      return navigator.mediaDevices.getUserMedia(toConstraints());
    }

    throw error;
  }
}

export function openCameraStream(cameraId: string) {
  // 화질(RESOLUTION) 설정은 기획 보류 상태이므로 width/height 제약은 넘기지 않는다.
  // 보류가 해제되면 여기서 RESOLUTION_OPTIONS 값을 제약으로 변환하면 된다.
  return openWithFallback(cameraId, (id) => ({
    video: id ? { deviceId: { exact: id } } : true,
  }));
}

export function openMicrophoneStream(microphoneId: string) {
  return openWithFallback(microphoneId, (id) => ({
    audio: id ? { deviceId: { exact: id } } : true,
  }));
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

/** setSinkId 미지원 브라우저에서는 조용히 기본 출력 기기를 쓴다. */
export async function applyAudioSinkId(element: HTMLAudioElement, speakerId: string) {
  if (!speakerId) {
    return;
  }

  const elementWithSink = element as HTMLAudioElement & {
    setSinkId?: (sinkId: string) => Promise<void>;
  };

  if (typeof elementWithSink.setSinkId !== 'function') {
    return;
  }

  try {
    await elementWithSink.setSinkId(speakerId);
  } catch {
    // 기기가 사라졌거나 권한이 없는 경우 — 기본 출력으로 재생한다.
  }
}
