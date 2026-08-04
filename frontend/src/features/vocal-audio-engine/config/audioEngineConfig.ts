/**
 * RNNoise 워크릿이 48kHz 고정 AudioContext를 요구하므로 미리 같은 값으로 통일한다.
 * Tone.js가 만드는 기본 컨텍스트(기기 샘플레이트)와 섞이면 서로 다른 컨텍스트의
 * 노드를 connect()할 수 없어 런타임 InvalidAccessError가 난다.
 */
export const AUDIO_CONTEXT_SAMPLE_RATE = 48000;

/** 제스처가 값을 프레임 단위로 바꾸므로 즉시 대입 대신 짧은 램프로 지퍼 노이즈를 막는다 */
export const PARAM_RAMP_SECONDS = 0.05;

/** PitchShift 그레인 크기(초). 이 값만큼 MR이 지연된다 — 줄이면 지연 대신 음이 뭉개진다 */
export const PITCH_SHIFT_WINDOW_SIZE = 0.1;

/** 에코 반복 간격. 데모와 같은 8분음표(기본 BPM 120 기준 0.25초) */
export const ECHO_DELAY_TIME = '8n';

/** echoLevel 0~100 → 피드백 0~0.7 / 웻 0~0.8 사상 (데모 계수 유지) */
export const ECHO_FEEDBACK_PER_PERCENT = 0.007;
export const ECHO_WET_PER_PERCENT = 0.008;

/** 음량 0%의 바닥값. -Infinity는 램프 목표가 될 수 없어 유한한 무음 레벨을 쓴다 */
export const SILENCE_DB = -80;

/**
 * 마이크 입력 캡처 지연 추정치(초). 브라우저가 입력 지연을 노출하지 않아 상수로 둔다.
 * 송출 목소리가 MR보다 늦는 만큼(출력 지연 + 이 값) 송출 MR을 늦춰 싱크를 맞춘다.
 * 녹음 비교로 캘리브레이션하는 지점 — 목소리가 여전히 늦으면 올리고, 앞서면 내린다.
 */
export const MIC_INPUT_LATENCY_ESTIMATE_SECONDS = 0.025;

/** 송출 MR 보정 딜레이의 상한(초). DelayNode 버퍼 크기라 생성 후 못 늘린다 */
export const BROADCAST_MR_SYNC_MAX_DELAY_SECONDS = 0.3;

/** RNNoise 워클릿의 내부 프레임 버퍼링(480샘플@48kHz). 송출 MR 보정량에 더한다 */
export const RNNOISE_LATENCY_SECONDS = 0.01;

/** copy:rnnoise-assets 스크립트가 public에 생성하는 정적 경로 (predev/prebuild 훅) */
export const RNNOISE_WORKLET_URL = '/noise-suppressor/rnnoiseWorklet.js';
export const RNNOISE_WASM_URL = '/noise-suppressor/rnnoise.wasm';
export const RNNOISE_WASM_SIMD_URL = '/noise-suppressor/rnnoise_simd.wasm';

/** 순 피치 변화가 이 미만이면 0으로 보고 PitchShift를 바이패스한다 */
export const PITCH_BYPASS_EPSILON = 0.01;

/**
 * 채점용 음정 분석 창 크기. 48kHz에서 약 43ms로, 남성 저음(E2 ≈ 82Hz)도 두 주기가 들어간다.
 * McLeod 음정 검출은 창 안에 최소 두 주기가 있어야 음을 잡는다.
 */
export const VOCAL_ANALYSER_FFT_SIZE = 2048;

/**
 * 가창자 마이크 캡처 제약 — 3개 모두 false가 사양이다.
 * AEC는 이어폰 모니터링과 충돌해 자기 목소리를 에코로 판단해 지우고,
 * NS는 추후 RNNoise 워크릿이 맡을 자리이며, AGC는 노래 다이내믹을 뭉갠다.
 * 이어폰 착용 전제라 스피커 누출(하울링)도 없다.
 */
export const VOCAL_CAPTURE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
};
