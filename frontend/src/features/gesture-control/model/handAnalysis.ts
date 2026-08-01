import { GESTURE_CONFIG } from '../config/gestureConfig';

export interface HandMetrics {
  /** 검지만 펴짐 또는 엄지-검지 핀치 = 값을 잡는 동작 */
  isIndexSelecting: boolean;
  /** 손바닥 활짝 펴기 = 패널 열기 */
  isPalmOpen: boolean;
  /** 브이 = 패널 닫기 */
  isVSign: boolean;
}

function distance(a: MpLandmark, b: MpLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// 손목을 기준으로 각 손가락 끝이 중간 관절보다 멀리 있는지로 펴짐을 판정한다.
export function analyzeHand(landmarks: MpLandmark[]): HandMetrics {
  const wrist = landmarks[0];
  const { extendedRatio, thumbExtendedRatio, pinchRatio, palmOpenFingerCount } = GESTURE_CONFIG;

  const indexExtended =
    distance(landmarks[8], wrist) > distance(landmarks[6], wrist) * extendedRatio;
  const middleExtended =
    distance(landmarks[12], wrist) > distance(landmarks[10], wrist) * extendedRatio;
  const ringExtended =
    distance(landmarks[16], wrist) > distance(landmarks[14], wrist) * extendedRatio;
  const pinkyExtended =
    distance(landmarks[20], wrist) > distance(landmarks[18], wrist) * extendedRatio;
  const thumbExtended =
    distance(landmarks[4], landmarks[17]) >
    distance(landmarks[2], landmarks[17]) * thumbExtendedRatio;

  const extendedCount = [
    indexExtended,
    middleExtended,
    ringExtended,
    pinkyExtended,
    thumbExtended,
  ].filter(Boolean).length;

  const isIndexPointing = indexExtended && !middleExtended && !ringExtended && !pinkyExtended;
  const palmSize = distance(landmarks[0], landmarks[9]);
  const isIndexPinch =
    distance(landmarks[8], landmarks[4]) < palmSize * pinchRatio && indexExtended;

  const isIndexSelecting = isIndexPointing || isIndexPinch;
  const isVSign =
    indexExtended && middleExtended && !ringExtended && !pinkyExtended && !isIndexSelecting;
  // 다섯 손가락을 모두 펴야 열린다. 네 개만 펴도 열리면 오작동이 잦다.
  const isPalmOpen = extendedCount >= palmOpenFingerCount && !isIndexSelecting && !isVSign;

  return { isIndexSelecting, isPalmOpen, isVSign };
}

// 공연 종료 제스처. 양손 검지 선분이 실제로 교차하는지 2D로 본다.
export function isTwoHandXGesture(first: MpLandmark[], second: MpLandmark[]): boolean {
  if (!analyzeHand(first).isIndexSelecting || !analyzeHand(second).isIndexSelecting) {
    return false;
  }

  const a = first[5];
  const b = first[8];
  const c = second[5];
  const d = second[8];
  const ccw = (p1: MpLandmark, p2: MpLandmark, p3: MpLandmark) =>
    (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);

  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}
