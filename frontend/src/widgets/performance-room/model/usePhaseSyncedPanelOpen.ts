'use client';

import { useState } from 'react';

import { useStageStore, type StagePhase } from './stageStore';

/** phase가 바뀔 때만 기본 열림·닫힘을 맞춘다. 그 외에는 사용자 토글을 유지한다 */
export function usePhaseSyncedPanelOpen(getDefault: (phase: StagePhase) => boolean) {
  const phase = useStageStore((state) => state.phase);
  const [open, setOpen] = useState(() => getDefault(phase));
  const [syncedPhase, setSyncedPhase] = useState(phase);

  if (phase !== syncedPhase) {
    setSyncedPhase(phase);
    setOpen(getDefault(phase));
  }

  const toggle = () => setOpen((previous) => !previous);

  return { open, setOpen, toggle };
}
