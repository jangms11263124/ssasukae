import type { MediaDeviceGroups, MediaDeviceOption } from '../types';

export const EMPTY_DEVICE_GROUPS: MediaDeviceGroups = {
  cameras: [],
  microphones: [],
  speakers: [],
};

function toOptions(
  devices: MediaDeviceInfo[],
  kind: MediaDeviceKind,
  fallbackPrefix: string,
): MediaDeviceOption[] {
  return devices
    .filter((device) => device.kind === kind)
    .map((device, index) => ({
      deviceId: device.deviceId,
      // 권한이 없으면 label이 빈 문자열로 내려오므로 최소한의 식별자라도 보여준다.
      label: device.label || `${fallbackPrefix} ${index + 1}`,
    }));
}

export function groupDevices(devices: MediaDeviceInfo[]): MediaDeviceGroups {
  // Chrome은 audioinput/audiooutput에 'communications' 의사 기기를 끼워 넣어 목록을 중복시킨다.
  const usable = devices.filter((device) => device.deviceId !== 'communications');

  return {
    cameras: toOptions(usable, 'videoinput', 'CAMERA'),
    microphones: toOptions(usable, 'audioinput', 'MICROPHONE'),
    speakers: toOptions(usable, 'audiooutput', 'OUTPUT'),
  };
}
