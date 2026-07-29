import type { DeviceSettings } from '../types';

export const SYSTEM_DEFAULT_DEVICE_ID = '';

/**
 * 화질 설정은 기획 보류 상태라 목록만 노출하고 선택은 막아둔다.
 * 보류가 해제되면 각 항목에 width/height를 붙여 getUserMedia 제약으로 넘기면 된다.
 */
export const RESOLUTION_OPTIONS = [
  { value: '1080p', label: '1080P (Full HD)' },
  { value: '720p', label: '720P (HD)' },
  { value: '480p', label: '480P (SD)' },
] as const;

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  cameraId: SYSTEM_DEFAULT_DEVICE_ID,
  microphoneId: SYSTEM_DEFAULT_DEVICE_ID,
  speakerId: SYSTEM_DEFAULT_DEVICE_ID,
  resolution: '1080p',
  isMirrored: true,
  outputVolume: 80,
};

export const MIN_INPUT_LEVEL_DB = -60;
export const MAX_INPUT_LEVEL_DB = 0;
