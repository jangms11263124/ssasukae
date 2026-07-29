import { create } from 'zustand';

import { DEFAULT_DEVICE_SETTINGS } from '../config/deviceSettings';
import type { DeviceSettings } from '../types';

const STORAGE_KEY = 'ssafy-star:device-settings';

interface DeviceSettingsStore {
  settings: DeviceSettings;
  /** localStorage 반영 여부. SSR 렌더 결과와 어긋나지 않도록 클라이언트에서만 true가 된다. */
  isHydrated: boolean;
  hydrate: () => void;
  save: (next: DeviceSettings) => void;
  reset: () => void;
}

function asString(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function asVolume(value: unknown, fallback: number) {
  const isValid = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

  return isValid ? value : fallback;
}

/** 저장 스키마가 바뀌거나 값이 오염돼도 화면이 깨지지 않도록 필드 단위로 검증한다. */
function parseStoredSettings(raw: string): DeviceSettings {
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    return DEFAULT_DEVICE_SETTINGS;
  }

  const stored = parsed as Partial<Record<keyof DeviceSettings, unknown>>;
  const defaults = DEFAULT_DEVICE_SETTINGS;

  return {
    cameraId: asString(stored.cameraId, defaults.cameraId),
    microphoneId: asString(stored.microphoneId, defaults.microphoneId),
    speakerId: asString(stored.speakerId, defaults.speakerId),
    resolution: asString(stored.resolution, defaults.resolution),
    isMirrored: asBoolean(stored.isMirrored, defaults.isMirrored),
    outputVolume: asVolume(stored.outputVolume, defaults.outputVolume),
  };
}

function writeStorage(settings: DeviceSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 시크릿 모드 등 localStorage 접근이 막힌 환경에서도 현재 세션 설정은 유지되어야 한다.
  }
}

function readStorage(): DeviceSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    return raw ? parseStoredSettings(raw) : DEFAULT_DEVICE_SETTINGS;
  } catch {
    return DEFAULT_DEVICE_SETTINGS;
  }
}

export const useDeviceSettingsStore = create<DeviceSettingsStore>((set) => ({
  settings: DEFAULT_DEVICE_SETTINGS,
  isHydrated: false,
  hydrate: () => set({ settings: readStorage(), isHydrated: true }),
  save: (next) => {
    writeStorage(next);
    set({ settings: next });
  },
  reset: () => {
    writeStorage(DEFAULT_DEVICE_SETTINGS);
    set({ settings: DEFAULT_DEVICE_SETTINGS });
  },
}));
