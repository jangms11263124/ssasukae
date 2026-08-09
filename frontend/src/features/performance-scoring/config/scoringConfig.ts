/** STT 청크 길이. AI 계약이 30초 단위 전송을 전제로 한다 */
export const STT_CHUNK_DURATION_MS = 30_000;

/**
 * 시연용 데모 채점. 기본 ON — AI·STT·음정 수집을 건너뛰고 공연 종료 후
 * DEMO_MOCK_SCORING_DELAY_MS 뒤 88~100점을 서버에 반영한다.
 * 시연 후 NEXT_PUBLIC_DEMO_MOCK_SCORING=false 로 되돌리거나 이 값을 false 로 고정할 것.
 */
export const DEMO_MOCK_SCORING = process.env.NEXT_PUBLIC_DEMO_MOCK_SCORING !== 'false';

/** 데모 채점 결과를 보여주기 전 대기 시간 */
export const DEMO_MOCK_SCORING_DELAY_MS = 3_000;

/**
 * 이보다 작은 조각은 전송하지 않는다. 청크 경계에서 잘린 수백 바이트짜리 무음을 보내면
 * Whisper가 없는 말을 지어내 transcript를 오염시킨다.
 */
export const STT_MIN_CHUNK_BYTES = 4_096;

/** 브라우저별 지원 컨테이너. 앞에서부터 지원하는 첫 형식을 쓴다 */
export const STT_MIME_CANDIDATES = [
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
  { mimeType: 'audio/webm', extension: 'webm' },
  { mimeType: 'audio/mp4', extension: 'm4a' },
] as const;

/**
 * 음정 샘플 간격. AI 채점이 이 간격의 프레임 단위 note를 전제로 한다.
 * 안정성 점수가 "정답 note 구간에 겹친 가창 note들의 음높이 표준편차"라, note를 길게 묶으면
 * 구간마다 note가 하나뿐이라 표준편차가 늘 0이 되어 안정성이 항상 만점이 된다.
 */
export const PITCH_SAMPLE_INTERVAL_MS = 50;

/** McLeod 명료도 하한. 이보다 낮으면 자음·무음·잡음으로 보고 note를 만들지 않는다 */
export const PITCH_CLARITY_THRESHOLD = 0.9;

/** 이 아래 음량은 무음으로 본다 (0dB = 최대 진폭) */
export const PITCH_MIN_VOLUME_DECIBELS = -40;

/** 가창 범위 밖 검출은 배음·잡음 오검출로 보고 버린다 (C1 ~ C7) */
export const PITCH_MIN_MIDI = 24;
export const PITCH_MAX_MIDI = 96;
