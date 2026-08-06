'use client';

import { useState } from 'react';

import { useStageStore, type StagePhase } from './stageStore';

/** phase가 바뀔 때 패널을 자동으로 닫을지만 판단한다. 자동으로 여는 동작은 하지 않는다 */
export function usePhaseSyncedPanelOpen(getDefault: (phase: StagePhase) => boolean) {
  const phase = useStageStore((state) => state.phase);
  const [open, setOpen] = useState(() => getDefault(phase));
  const [syncedPhase, setSyncedPhase] = useState(phase);

  if (phase !== syncedPhase) {
    setSyncedPhase(phase);
    // 공연·모달 등 패널을 가려야 하는 phase로 넘어갈 때만 닫는다.
    // WAITING으로 돌아와도 사용자가 닫아 둔 상태는 유지한다.
    if (!getDefault(phase)) {
      setOpen(false);
    }
  }

  const toggle = () => setOpen((previous) => !previous);

  return { open, setOpen, toggle };
}
