import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { HAND_LOST_GRACE_MS } from '../config/gestureConfig';
import { CursorInteraction } from './CursorInteraction';
import { GestureDetector, type GestureCancelProgress } from './GestureDetector';

export interface UseGestureControlOptions {
  /** 손 인식 입력이 되는 <video>. 이미 스트림이 붙어 있어야 한다 */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** 커서 좌표의 기준이 되는 컨테이너 */
  containerRef: RefObject<HTMLElement | null>;
  /** 커서 DOM. 리렌더를 피하기 위해 transform을 직접 갱신한다 */
  cursorRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  isPanelOpen: boolean;
  rowCount: number;
  /** 양손 X자(취소) 제스처 사용 여부. false면 판정도 카운트다운도 하지 않는다 */
  cancelEnabled: boolean;
  onOpenPanel: () => void;
  onClosePanel: () => void;
  onCancelHold: () => void;
  onRowChange: (rowIndex: number | null) => void;
  onGrabStart: (rowIndex: number) => void;
  onDrag: (rowIndex: number, deltaX: number) => void;
  onGrabEnd: () => void;
}

export interface GestureControlState {
  isHandDetected: boolean;
  /** 취소 카운트다운. 진행 중이 아니거나 취소를 쓰지 않는 모드면 null */
  cancelProgress: GestureCancelProgress | null;
  error: string | null;
}

export function useGestureControl(options: UseGestureControlOptions): GestureControlState {
  const {
    videoRef,
    containerRef,
    cursorRef,
    enabled,
    isPanelOpen,
    rowCount,
    cancelEnabled,
    onOpenPanel,
    onClosePanel,
    onCancelHold,
    onRowChange,
    onGrabStart,
    onDrag,
    onGrabEnd,
  } = options;

  const [isHandDetected, setIsHandDetected] = useState(false);
  const [cancelProgress, setCancelProgress] = useState<GestureCancelProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detectorRef = useRef<GestureDetector | null>(null);
  // 손이 화면 경계에 걸치면 인식이 깜빡인다. 배지가 요동치지 않게 유예를 둔다.
  const isHandDetectedRef = useRef(false);
  const handLostAtRef = useRef<number | null>(null);

  // 콜백이 매 렌더 새로 만들어져도 디텍터를 재생성하지 않도록 ref에 담아 둔다.
  // 갱신은 렌더 중이 아니라 커밋 이후에 해야 한다(react-hooks/refs).
  const handlersRef = useRef({
    onOpenPanel,
    onClosePanel,
    onCancelHold,
    onRowChange,
    onGrabStart,
    onDrag,
    onGrabEnd,
  });

  useEffect(() => {
    handlersRef.current = {
      onOpenPanel,
      onClosePanel,
      onCancelHold,
      onRowChange,
      onGrabStart,
      onDrag,
      onGrabEnd,
    };
  });

  // 매 프레임 setState하면 무대가 초당 30번 리렌더된다. 값이 바뀔 때만 갱신한다.
  const lastProgressKeyRef = useRef<string | null>(null);
  const applyCancelProgress = useCallback((next: GestureCancelProgress | null) => {
    const key = next === null ? null : `${next.percent}:${next.remainingSec}`;

    if (key === lastProgressKeyRef.current) return;
    lastProgressKeyRef.current = key;
    setCancelProgress(next);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const video = videoRef.current;
    const container = containerRef.current;

    if (!video || !container) return;

    let isCancelled = false;

    const getViewport = () => {
      const rect = container.getBoundingClientRect();

      return { width: rect.width, height: rect.height };
    };

    const interaction = new CursorInteraction(rowCount, {
      onRowChange: (rowIndex) => handlersRef.current.onRowChange(rowIndex),
      onGrabStart: (rowIndex) => handlersRef.current.onGrabStart(rowIndex),
      onDrag: (rowIndex, deltaX) => handlersRef.current.onDrag(rowIndex, deltaX),
      onGrabEnd: () => handlersRef.current.onGrabEnd(),
    });

    const detector = new GestureDetector(video, getViewport, {
      onCursorMove: (x, y, isSelecting, detected) => {
        if (detected) {
          handLostAtRef.current = null;

          if (!isHandDetectedRef.current) {
            isHandDetectedRef.current = true;
            setIsHandDetected(true);
          }
        } else {
          handLostAtRef.current ??= performance.now();

          if (
            isHandDetectedRef.current &&
            performance.now() - handLostAtRef.current > HAND_LOST_GRACE_MS
          ) {
            isHandDetectedRef.current = false;
            setIsHandDetected(false);
          }
        }

        const cursor = cursorRef.current;

        if (cursor) {
          cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          cursor.dataset.visible = detected ? 'true' : 'false';
          cursor.dataset.grabbing = isSelecting ? 'true' : 'false';
        }

        if (!detected) {
          interaction.reset();

          return;
        }
        interaction.update(x, y, isSelecting, getViewport().height);
      },
      onOpenPanel: () => handlersRef.current.onOpenPanel(),
      onClosePanel: () => handlersRef.current.onClosePanel(),
      onCancelHold: () => handlersRef.current.onCancelHold(),
      onCancelProgress: applyCancelProgress,
    },
    cancelEnabled,
    );

    detectorRef.current = detector;
    detector.setPanelOpen(isPanelOpen);

    detector
      .init()
      .then(() => {
        if (isCancelled) detector.destroy();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      // StrictMode의 마운트→정리→재마운트를 버텨야 한다.
      isCancelled = true;
      detectorRef.current = null;
      detector.destroy();
      interaction.reset();
      isHandDetectedRef.current = false;
      handLostAtRef.current = null;
      setIsHandDetected(false);
      setCancelProgress(null);
      lastProgressKeyRef.current = null;
      // 비우지 않으면 껐다 켜도 지난 오류 배지가 계속 뜬다.
      setError(null);
    };
    // isPanelOpen은 아래 별도 effect에서 반영한다(디텍터 재생성 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rowCount, cancelEnabled, videoRef, containerRef, cursorRef, applyCancelProgress]);

  useEffect(() => {
    detectorRef.current?.setPanelOpen(isPanelOpen);
  }, [isPanelOpen]);

  return { isHandDetected, cancelProgress, error };
}
