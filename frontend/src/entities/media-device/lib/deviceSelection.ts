import { SYSTEM_DEFAULT_DEVICE_ID } from '../config/deviceSettings';
import type { DeviceSettings, MediaDeviceOption } from '../types';

/**
 * 저장된 deviceId가 현재 연결 목록에 없으면(기기 분리, 프로필 변경 등)
 * 첫 번째 기기로 대체해 셀렉트가 빈 값으로 남지 않게 한다.
 * 빈 문자열은 "시스템 기본 기기"를 뜻하므로 여기서도 첫 항목으로 해석된다.
 */
export function resolveDeviceId(preferredId: string, options: MediaDeviceOption[]) {
  if (options.some((option) => option.deviceId === preferredId)) {
    return preferredId;
  }

  return options[0]?.deviceId ?? SYSTEM_DEFAULT_DEVICE_ID;
}

export function isSameDeviceSettings(left: DeviceSettings, right: DeviceSettings) {
  return (
    left.cameraId === right.cameraId &&
    left.microphoneId === right.microphoneId &&
    left.speakerId === right.speakerId &&
    left.resolution === right.resolution &&
    left.isMirrored === right.isMirrored &&
    left.outputVolume === right.outputVolume
  );
}
