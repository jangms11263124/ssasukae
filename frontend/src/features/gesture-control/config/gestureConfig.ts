// 조작감이 전부 여기서 결정된다. 데모에서 검증된 값이라 임의로 바꾸지 말 것.
export const GESTURE_CONFIG = {
  /** 손바닥 펼침(열기) / 브이(닫기) 유지 시간 */
  holdThresholdMs: 400,
  /** 양손 검지 X자 유지 시간 → 공연 종료 */
  cancelHoldMs: 3000,
  /** 커서 EMA 계수. 크면 즉각적이고 작으면 부드럽다 */
  smoothingFactor: 0.28,
  /**
   * 검지 끝 좌표를 화면 전체로 늘리는 범위. 팔을 끝까지 뻗지 않아도 닿게 한다.
   * max를 키우면 맨 아래 항목을 고르다 손이 카메라 밖으로 나가 인식이 끊겨,
   * 데모(0.82)보다 좁혔다.
   */
  normalizeX: { min: 0.08, max: 0.92 },
  normalizeY: { min: 0.12, max: 0.72 },
  /**
   * 행 선택 구간. 무대 전체를 그대로 나눠 쓴다.
   * 데모는 위쪽 15%를 보호 구역으로 뒀지만 그건 커서로 DOM을 클릭했기 때문이고,
   * 지금은 좌표 계산만 해서 오조작 위험이 없다.
   */
  rowZoneTopRatio: 0,
  rowZoneBottomRatio: 1,
  /** 손가락 펴짐 판정: 끝 관절이 중간 관절보다 이 배수 이상 멀면 펴진 것 */
  extendedRatio: 1.15,
  /** 엄지 펴짐 판정 배수 */
  thumbExtendedRatio: 1.1,
  /** 핀치 판정: 검지-엄지 거리가 손바닥 크기의 이 배수 미만이면 핀치 */
  pinchRatio: 0.38,
  /** 패널을 열려면 다섯 손가락을 모두 펴야 한다 (엄지 포함) */
  palmOpenFingerCount: 5,
  /** 제어에 사용하는 손 */
  controlHand: 'Right' as MpHandedness['label'],
  /**
   * 양손 X자(공연 종료)를 봐야 해서 2가 필요하다.
   * modelComplexity는 0으로 낮추면 CPU를 아끼는데, 손바닥/브이/검지 구분에는
   * 충분할 수 있다. 실기 테스트 후 결정.
   */
  maxNumHands: 2,
  modelComplexity: 1 as 0 | 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7,
} as const;

/** 손 인식이 끊긴 뒤 '미인식'으로 표시하기까지의 유예. 상태 배지 깜빡임 방지 */
export const HAND_LOST_GRACE_MS = 300;

/** MediaPipe Hands CDN */
export const MEDIAPIPE_HANDS_SRC = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
export const MEDIAPIPE_FILE_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands';
