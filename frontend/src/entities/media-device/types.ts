export interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

export interface MediaDeviceGroups {
  cameras: MediaDeviceOption[];
  microphones: MediaDeviceOption[];
  speakers: MediaDeviceOption[];
}

/**
 * - `idle`: 아직 권한을 요청하지 않은 상태
 * - `unsupported`: 보안 컨텍스트(https/localhost)가 아니거나 브라우저가 미디어 기기를 지원하지 않는 상태
 */
export type MediaPermissionStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unsupported';

export interface DeviceSettings {
  /** 빈 문자열은 "시스템 기본 기기"를 의미한다. 저장된 기기가 사라졌을 때의 폴백 값으로도 쓴다. */
  cameraId: string;
  microphoneId: string;
  speakerId: string;
  /** 화질 설정은 기획 보류 상태. 값만 보관하고 실제 제약으로는 사용하지 않는다. */
  resolution: string;
  isMirrored: boolean;
  /** 0 ~ 100 */
  outputVolume: number;
}
