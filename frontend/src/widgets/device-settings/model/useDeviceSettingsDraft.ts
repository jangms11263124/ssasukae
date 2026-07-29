'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  isSameDeviceSettings,
  useDeviceSettingsStore,
  type DeviceSettings,
} from '@/entities/media-device';

/**
 * SAVE CHANGES를 누를 때까지 변경 사항을 초안으로만 들고 있는다.
 *
 * 아직 손대지 않았으면 초안은 null이고, 이때 화면은 저장된 설정을 그대로 따른다.
 * 이렇게 파생시키면 localStorage 값을 초안으로 복사하는 이펙트가 필요하지 않다.
 */
export function useDeviceSettingsDraft() {
  const savedSettings = useDeviceSettingsStore((state) => state.settings);
  const hydrate = useDeviceSettingsStore((state) => state.hydrate);
  const save = useDeviceSettingsStore((state) => state.save);
  const reset = useDeviceSettingsStore((state) => state.reset);

  const [draftOverride, setDraftOverride] = useState<DeviceSettings | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const updateDraft = useCallback(
    <Key extends keyof DeviceSettings>(key: Key, value: DeviceSettings[Key]) => {
      setDraftOverride((previous) => ({ ...(previous ?? savedSettings), [key]: value }));
    },
    [savedSettings],
  );

  // setState 업데이터는 StrictMode에서 두 번 호출될 수 있으므로 저장은 그 밖에서 한다.
  const saveDraft = useCallback(() => {
    if (draftOverride) {
      save(draftOverride);
    }

    setDraftOverride(null);
  }, [draftOverride, save]);

  const resetDraft = useCallback(() => {
    reset();
    setDraftOverride(null);
  }, [reset]);

  return {
    draft: draftOverride ?? savedSettings,
    hasUnsavedChanges: draftOverride !== null && !isSameDeviceSettings(draftOverride, savedSettings),
    updateDraft,
    saveDraft,
    resetDraft,
  };
}
