import { GESTURE_CONFIG, MEDIAPIPE_FILE_BASE } from '../config/gestureConfig';
import { analyzeHand, isTwoHandXGesture, type HandMetrics } from './handAnalysis';

/** 공연 종료(양손 X자) 카운트다운. 열기/닫기는 0.4초로 짧아 안내 없이 즉시 반영한다. */
export interface GestureCancelProgress {
  /** 링 채움 정도 0~100 */
  percent: number;
  /** 남은 초 (3 → 2 → 1) */
  remainingSec: number;
}

export interface GestureCallbacks {
  /** 매 프레임 커서 위치. detected가 false면 손이 없는 상태 */
  onCursorMove: (x: number, y: number, isSelecting: boolean, detected: boolean) => void;
  onOpenPanel: () => void;
  onClosePanel: () => void;
  /** 양손 X자 3초 유지 완료 */
  onCancelHold: () => void;
  onCancelProgress: (progress: GestureCancelProgress | null) => void;
}

interface Viewport {
  width: number;
  height: number;
}

export class GestureDetector {
  private hands: MpHands | null = null;
  private rafId = 0;
  private isSending = false;
  private isDestroyed = false;
  private isPanelOpen = false;
  private cursorX: number;
  private cursorY: number;
  private palmOpenStartedAt: number | null = null;
  private vSignStartedAt: number | null = null;
  private cancelStartedAt: number | null = null;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly getViewport: () => Viewport,
    private readonly callbacks: GestureCallbacks,
    /** 양손 X자(취소) 판정 여부. 취소가 없는 모드에서는 꺼서 오조작·카운트다운을 원천 차단한다 */
    private readonly cancelEnabled = true,
  ) {
    const { width, height } = getViewport();
    this.cursorX = width / 2;
    this.cursorY = height / 2;
  }

  async init(): Promise<void> {
    if (!window.Hands) {
      throw new Error('MediaPipe Hands 스크립트가 로드되지 않았습니다.');
    }

    const hands = new window.Hands({
      locateFile: (file) => `${MEDIAPIPE_FILE_BASE}/${file}`,
    });
    hands.setOptions({
      maxNumHands: GESTURE_CONFIG.maxNumHands,
      modelComplexity: GESTURE_CONFIG.modelComplexity,
      minDetectionConfidence: GESTURE_CONFIG.minDetectionConfidence,
      minTrackingConfidence: GESTURE_CONFIG.minTrackingConfidence,
      // <video>도 CSS로 좌우 반전돼 있다. 둘을 맞춰야 손을 오른쪽으로 옮길 때
      // 커서도 오른쪽으로 간다. 한쪽만 바꾸면 방향이 뒤집힌다.
      selfieMode: true,
    });
    hands.onResults((results) => this.handleResults(results));
    this.hands = hands;

    this.pump();
  }

  destroy(): void {
    this.isDestroyed = true;
    cancelAnimationFrame(this.rafId);
    const hands = this.hands;
    this.hands = null;
    void hands?.close().catch(() => {
      // 이미 해제된 경우는 무시한다.
    });
  }

  setPanelOpen(isOpen: boolean): void {
    this.isPanelOpen = isOpen;
  }

  /**
   * MediaPipe Camera 유틸은 카메라를 직접 열어버린다. 서비스는 이미 스트림이 붙은
   * <video>가 있어 카메라를 두 번 열면 안 되므로 프레임 공급 루프를 직접 돌린다.
   * isSending 가드 덕에 처리가 밀리면 프레임을 알아서 건너뛴다.
   */
  private pump = (): void => {
    this.rafId = requestAnimationFrame(this.pump);

    if (this.isDestroyed || this.isSending || !this.hands) return;
    if (this.video.readyState < 2 || this.video.videoWidth === 0) return;

    this.isSending = true;
    void this.hands
      .send({ image: this.video })
      .catch(() => {
        // 프레임 단위 실패는 다음 프레임에서 복구되므로 무시한다.
      })
      .finally(() => {
        this.isSending = false;
      });
  };

  private handleResults(results: MpResults): void {
    const hands = results.multiHandLandmarks ?? [];
    const handedness = results.multiHandedness ?? [];

    if (hands.length === 0 || handedness.length === 0) {
      this.resetHoldTimers();
      this.callbacks.onCursorMove(this.cursorX, this.cursorY, false, false);
      this.callbacks.onCancelProgress(null);

      return;
    }

    // 취소가 일반 제어보다 우선이다.
    if (this.cancelEnabled && hands.length >= 2 && isTwoHandXGesture(hands[0], hands[1])) {
      this.handleCancelGesture();

      return;
    }
    this.cancelStartedAt = null;
    this.callbacks.onCancelProgress(null);

    const controlIndex = handedness.findIndex(
      (hand) => hand.label === GESTURE_CONFIG.controlHand,
    );

    if (controlIndex === -1) {
      this.resetHoldTimers();
      this.callbacks.onCursorMove(this.cursorX, this.cursorY, false, false);

      return;
    }

    const landmarks = hands[controlIndex];
    this.updateCursor(landmarks);

    const metrics = analyzeHand(landmarks);
    this.callbacks.onCursorMove(this.cursorX, this.cursorY, metrics.isIndexSelecting, true);
    this.handlePanelToggle(metrics);
  }

  private updateCursor(landmarks: MpLandmark[]): void {
    const { normalizeX, normalizeY, smoothingFactor } = GESTURE_CONFIG;
    const { width, height } = this.getViewport();
    const tip = landmarks[8];

    const ratioX = (tip.x - normalizeX.min) / (normalizeX.max - normalizeX.min);
    const ratioY = (tip.y - normalizeY.min) / (normalizeY.max - normalizeY.min);
    const targetX = Math.min(1, Math.max(0, ratioX)) * width;
    const targetY = Math.min(1, Math.max(0, ratioY)) * height;

    this.cursorX += (targetX - this.cursorX) * smoothingFactor;
    this.cursorY += (targetY - this.cursorY) * smoothingFactor;
  }

  private handlePanelToggle(metrics: HandMetrics): void {
    const now = performance.now();

    if (!this.isPanelOpen) {
      this.vSignStartedAt = null;

      if (!metrics.isPalmOpen) {
        this.palmOpenStartedAt = null;

        return;
      }

      this.palmOpenStartedAt ??= now;

      if (now - this.palmOpenStartedAt >= GESTURE_CONFIG.holdThresholdMs) {
        this.palmOpenStartedAt = null;
        this.callbacks.onOpenPanel();
      }

      return;
    }

    this.palmOpenStartedAt = null;

    if (!metrics.isVSign) {
      this.vSignStartedAt = null;

      return;
    }

    this.vSignStartedAt ??= now;

    if (now - this.vSignStartedAt >= GESTURE_CONFIG.holdThresholdMs) {
      this.vSignStartedAt = null;
      this.callbacks.onClosePanel();
    }
  }

  private handleCancelGesture(): void {
    const now = performance.now();
    this.cancelStartedAt ??= now;

    const total = GESTURE_CONFIG.cancelHoldMs;
    const elapsed = now - this.cancelStartedAt;
    const percent = Math.min(100, Math.round((elapsed / total) * 100));
    // 3 → 2 → 1 로 떨어지는 카운트다운. 0은 곧바로 종료로 이어져 노출되지 않는다.
    const remainingSec = Math.max(1, Math.ceil((total - elapsed) / 1000));

    this.callbacks.onCancelProgress({ percent, remainingSec });

    if (elapsed >= total) {
      this.cancelStartedAt = null;
      this.callbacks.onCancelHold();
      this.callbacks.onCancelProgress(null);
    }
  }

  private resetHoldTimers(): void {
    this.palmOpenStartedAt = null;
    this.vSignStartedAt = null;
    this.cancelStartedAt = null;
  }
}
