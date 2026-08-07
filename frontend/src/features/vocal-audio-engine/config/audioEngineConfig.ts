/**
 * RNNoise 워크릿이 48kHz 고정 AudioContext를 요구하므로 미리 같은 값으로 통일한다.
 * Tone.js가 만드는 기본 컨텍스트(기기 샘플레이트)와 섞이면 서로 다른 컨텍스트의
 * 노드를 connect()할 수 없어 런타임 InvalidAccessError가 난다.
 */
export const AUDIO_CONTEXT_SAMPLE_RATE = 48000;

/** 제스처가 값을 프레임 단위로 바꾸므로 즉시 대입 대신 짧은 램프로 지퍼 노이즈를 막는다 */
export const PARAM_RAMP_SECONDS = 0.05;

/**
 * PitchShift 그레인 크기(초).
 *
 * Tone.PitchShift는 소리를 이 길이로 잘라 속도를 바꾼 뒤 겹쳐 붙이는 그래뉼러 방식이다.
 * 그레인이 길수록 드럼 같은 타격음이 경계에서 여러 번 겹쳐 윤곽이 뭉개진다. MR은 악기가
 * 다 섞인 완성 믹스라 이 번짐이 특히 잘 들린다 — 템포 한 칸(보정 약 0.84반음)에서도
 * 체감될 정도라 기본값 0.1에서 낮췄다.
 *
 * 너무 줄이면 그레인 교체 주기가 가청 대역에 들어와 금속성 소리가 생기므로 하한이 있다.
 * 곡에 따라 다르니 0.03~0.08 사이에서 귀로 잡는다.
 *
 * 이 값은 wet 경로에만 지연을 만든다. 키 0(바이패스)과 키 ±1 사이를 오갈 때 MR이 그만큼
 * 튀므로, 줄이면 그 점프도 함께 작아진다. 송출 싱크 계산식에는 들어가지 않아 영향 없다.
 */
export const PITCH_SHIFT_WINDOW_SIZE = 0.05;

/**
 * 에코(`echoLevel`)는 딜레이가 아니라 `Tone.Reverb`로 구현한다.
 * 딜레이(FeedbackDelay)는 원리상 원음을 일정 간격으로 되풀이하므로, 간격을 줄여도
 * 피드백이 남는 한 반복이 쌓여 "말이 두 번" 들린다. 데모에서 옮겨온 0.25초는 물론
 * 0.11초로 줄여도 레벨을 올리면 220ms·330ms 반복이 또렷하게 분리됐다.
 * 리버브는 수천 개의 반사를 흩어 꼬리로 만들기 때문에 되풀이가 아니라 울림으로 들린다.
 *
 * decay는 생성 시 임펄스 응답을 굽는 값이라 런타임에 못 바꾼다(비동기 재생성 필요).
 * 그래서 decay·preDelay는 고정하고 사용자가 조절하는 것은 wet 하나뿐이다.
 */
/** 울림 꼬리 길이(초). 길면 넓은 홀, 짧으면 작은 방 */
export const ECHO_DECAY_SECONDS = 1.6;

/** 원음과 반사음 사이 간격(초). 목소리 윤곽이 뭉개지지 않게 살짝 띄운다 */
export const ECHO_PRE_DELAY_SECONDS = 0.02;

/**
 * echoLevel 100에서의 웻 상한. 여기서 원음은 25%만 남아 목소리가 상당히 젖는다.
 *
 * 매핑은 선형이 아니라 제곱근이다(`max * sqrt(level / 100)`).
 * 실기 테스트에서 기본값 30이 너무 밋밋하고 선형 매핑의 100이 딱 맞는다는 결론이 나왔는데,
 * 백엔드 defaults()가 30이라 기본값 자체는 옮길 수 없다(재개 시 서버 값과 어긋난다).
 * 선형 계수만 올리면 레벨 75에서 웻이 1.0(원음 0%)에 닿아 75~100이 전부 같은 소리가 된다.
 * 제곱근은 낮은 쪽 해상도를 키워 30에서 약 0.41(= 이전 선형 100과 같은 울림)을 주면서
 * 위쪽 구간도 살려 둔다.
 */
export const ECHO_WET_MAX = 0.75;

/** 음량 0%의 바닥값. -Infinity는 램프 목표가 될 수 없어 유한한 무음 레벨을 쓴다 */
export const SILENCE_DB = -80;

/**
 * 마이크 입력 캡처 지연 추정치(초). 브라우저가 입력 지연을 노출하지 않아 상수로 둔다.
 * 송출 목소리가 MR보다 늦는 만큼(출력 지연 + 이 값) 송출 MR을 늦춰 싱크를 맞춘다.
 * 녹음 비교로 캘리브레이션하는 지점 — 목소리가 여전히 늦으면 올리고, 앞서면 내린다.
 */
export const MIC_INPUT_LATENCY_ESTIMATE_SECONDS = 0.05;

/** 송출 MR 보정 딜레이의 상한(초). DelayNode 버퍼 크기라 생성 후 못 늘린다 */
export const BROADCAST_MR_SYNC_MAX_DELAY_SECONDS = 0.3;

/** RNNoise 워클릿의 내부 프레임 버퍼링(480샘플@48kHz). 송출 MR 보정량에 더한다 */
export const RNNOISE_LATENCY_SECONDS = 0.01;

/** copy:rnnoise-assets 스크립트가 public에 생성하는 정적 경로 (predev/prebuild 훅) */
export const RNNOISE_WORKLET_URL = '/noise-suppressor/rnnoiseWorklet.js';
export const RNNOISE_WASM_URL = '/noise-suppressor/rnnoise.wasm';
export const RNNOISE_WASM_SIMD_URL = '/noise-suppressor/rnnoise_simd.wasm';

/**
 * 송출 목소리 메이크업 게인(dB). 캡처에서 AGC를 끄기 때문에(VOCAL_CAPTURE_CONSTRAINTS)
 * 공연 시작과 함께 송출 트랙이 OpenVidu 기본 마이크(AGC 적용)에서 이 믹스로 교체되는 순간
 * 청자가 듣는 목소리가 뚝 떨어진다. 그 낙차를 메우는 고정 보정값 —
 * 녹음 비교로 캘리브레이션하는 지점이다 (목소리가 묻히면 올리고, 갈라지면 내린다).
 */
export const BROADCAST_VOICE_MAKEUP_DB = 16;

/** 송출 믹스의 MR 트림(dB). 목소리를 올린 만큼 MR을 덜어 합산 피크를 지킨다 (모니터는 그대로) */
export const BROADCAST_MR_TRIM_DB = -3;

/**
 * 송출 목소리 컴프레서. AGC를 끈 대신 여기서 최소한의 균일화만 한다 —
 * 노래 다이내믹을 살리려고 비율은 낮게 두고, 큰 소리만 눌러 리미터까지 가지 않게 한다.
 */
export const BROADCAST_VOICE_COMPRESSOR = {
  threshold: -20,
  ratio: 2.5,
  attack: 0.006,
  release: 0.2,
  knee: 12,
} as const;

/** 송출 버스 리미터 임계(dB). 목소리+MR 합산이 풀스케일을 넘어 찌그러지는 것을 막는다 */
export const BROADCAST_LIMITER_THRESHOLD_DB = -1;

/** SoundTouch WSOLA overlap */
export const SOUNDTOUCH_OVERLAP_MS = 8;

/** copy:soundtouch-processor 스크립트가 public에 생성하는 정적 경로 */
export const SOUNDTOUCH_PROCESSOR_URL = '/soundtouch/soundtouch-processor.js';

/**
 * SoundTouch MR 처리 지연 추정치(초). WSOLA 버퍼링으로 MR이 목소리보다 늦게 들린다.
 * 모니터 목소리에 같은 만큼 딜레이를 주고, 송출 MR 보정량에서는 뺀다 — 녹음으로 캘리브레이션.
 */
export const SOUNDTOUCH_MR_LATENCY_SECONDS = 0.055;

/** dev 랩 Tone 엔진용 — 순 피치 변화가 이 미만이면 PitchShift 바이패스 */
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
