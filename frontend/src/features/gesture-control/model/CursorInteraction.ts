import { GESTURE_CONFIG } from '../config/gestureConfig';

export interface CursorInteractionCallbacks {
  /** 조준 중인 행이 바뀔 때만 호출. null이면 보호 구역 */
  onRowChange: (rowIndex: number | null) => void;
  onGrabStart: (rowIndex: number) => void;
  onDrag: (rowIndex: number, deltaX: number) => void;
  onGrabEnd: () => void;
}

/**
 * 커서 좌표를 받아 "몇 번째 행인가 / 잡았는가 / 얼마나 끌었는가"만 판단한다.
 * 데모의 elementFromPoint 클릭 시뮬레이션은 React와 충돌하고 무대 밖 요소까지
 * 누를 수 있어 쓰지 않는다.
 */
export class CursorInteraction {
  private isGrabbing = false;
  private grabbedRowIndex: number | null = null;
  private hoveredRowIndex: number | null = null;
  private grabStartX = 0;

  constructor(
    private readonly rowCount: number,
    private readonly callbacks: CursorInteractionCallbacks,
  ) {}

  reset(): void {
    if (this.isGrabbing) {
      this.callbacks.onGrabEnd();
    }
    this.isGrabbing = false;
    this.grabbedRowIndex = null;
    this.hoveredRowIndex = null;
  }

  update(x: number, y: number, isSelecting: boolean, viewportHeight: number): void {
    const justGrabbed = isSelecting && !this.isGrabbing;
    const justReleased = !isSelecting && this.isGrabbing;

    if (justReleased) {
      this.grabbedRowIndex = null;
      this.callbacks.onGrabEnd();
    }

    // 잡고 있는 동안에는 행 탐색을 멈춘다(드래그 잠금).
    // 값을 조절하다 손이 위아래로 흔들려 다른 행으로 넘어가는 것을 막는다.
    if (this.isGrabbing && this.grabbedRowIndex !== null) {
      this.callbacks.onDrag(this.grabbedRowIndex, x - this.grabStartX);
      this.isGrabbing = isSelecting;

      return;
    }

    if (!this.isGrabbing) {
      const rowIndex = this.resolveRowIndex(y, viewportHeight);

      if (rowIndex !== this.hoveredRowIndex) {
        this.hoveredRowIndex = rowIndex;
        this.callbacks.onRowChange(rowIndex);
      }
    }

    if (justGrabbed && this.hoveredRowIndex !== null) {
      this.grabbedRowIndex = this.hoveredRowIndex;
      this.grabStartX = x;
      this.callbacks.onGrabStart(this.grabbedRowIndex);
    }

    this.isGrabbing = isSelecting;
  }

  private resolveRowIndex(y: number, viewportHeight: number): number | null {
    const { rowZoneTopRatio, rowZoneBottomRatio } = GESTURE_CONFIG;
    const ratio = y / viewportHeight;

    // 구간 밖은 '조준한 행 없음'. 현재 설정은 무대 전체(0~1)라 실제로 걸리지
    // 않지만, 보호 구역을 다시 두고 싶을 때 config만 고치면 되도록 남겨 둔다.
    if (ratio < rowZoneTopRatio || ratio > rowZoneBottomRatio) return null;

    const zoneHeight = rowZoneBottomRatio - rowZoneTopRatio;
    const relative = ratio - rowZoneTopRatio;

    return Math.min(this.rowCount - 1, Math.floor((relative / zoneHeight) * this.rowCount));
  }
}
