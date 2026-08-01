import { type RefObject, useCallback, useRef, useState } from 'react';

import { useGestureControl, type GestureControlState } from '@/features/gesture-control';

import { DSP_ROWS, ZERO_SNAP_RANGE } from '../config/dspParams';
import { useSettingsPublisher } from './useSettingsPublisher';
import { useStageStore } from './stageStore';

interface UseGestureDspControlOptions {
  containerRef: RefObject<HTMLElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  cursorRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  isPanelOpen: boolean;
  onOpenPanel: () => void;
  onClosePanel: () => void;
  /** 양손 X자 3초 유지 완료 → 공연 종료 */
  onFinishPerformance: () => void;
}

export interface GestureDspControlState extends GestureControlState {
  /** 현재 조준 중인 행. null이면 보호 구역 */
  activeRowIndex: number | null;
  /** 값을 잡고 드래그 중인 행 */
  grabbedRowIndex: number | null;
}

// 도메인을 모르는 features와 DSP를 아는 widgets를 잇는 지점.
export function useGestureDspControl(
  options: UseGestureDspControlOptions,
): GestureDspControlState {
  const publishSettings = useSettingsPublisher();
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(0);
  const [grabbedRowIndex, setGrabbedRowIndex] = useState<number | null>(null);
  // 잡은 순간의 값. 이 값을 기준으로 델타를 더해야 드래그가 누적되지 않는다.
  const dragStartValueRef = useRef(0);

  const handleRowChange = useCallback((rowIndex: number | null) => {
    setActiveRowIndex(rowIndex);
  }, []);

  const handleGrabStart = useCallback((rowIndex: number) => {
    const row = DSP_ROWS[rowIndex];

    if (!row) return;
    dragStartValueRef.current = row.read(useStageStore.getState().settings);
    setGrabbedRowIndex(rowIndex);
  }, []);

  const handleDrag = useCallback(
    (rowIndex: number, deltaX: number) => {
      const row = DSP_ROWS[rowIndex];

      if (!row) return;

      const raw = dragStartValueRef.current + deltaX / row.dragSensitivity;
      // 음정·템포는 0에 자석처럼 붙여 원음으로 되돌리기 쉽게 한다.
      const snapped =
        row.snapToZero && raw >= -ZERO_SNAP_RANGE && raw <= ZERO_SNAP_RANGE
          ? 0
          : Math.round(raw);
      const next = Math.min(row.max, Math.max(row.min, snapped));

      if (next === row.read(useStageStore.getState().settings)) return;
      publishSettings(row.write(next));
    },
    [publishSettings],
  );

  const handleGrabEnd = useCallback(() => {
    setGrabbedRowIndex(null);
  }, []);

  const gesture = useGestureControl({
    videoRef: options.videoRef,
    containerRef: options.containerRef,
    cursorRef: options.cursorRef,
    enabled: options.enabled,
    isPanelOpen: options.isPanelOpen,
    rowCount: DSP_ROWS.length,
    onOpenPanel: options.onOpenPanel,
    onClosePanel: options.onClosePanel,
    onCancelHold: options.onFinishPerformance,
    onRowChange: handleRowChange,
    onGrabStart: handleGrabStart,
    onDrag: handleDrag,
    onGrabEnd: handleGrabEnd,
  });

  return { ...gesture, activeRowIndex, grabbedRowIndex };
}
