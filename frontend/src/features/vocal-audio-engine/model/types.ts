/** 소리에 반영되는 설정값. 도메인 스토어를 모르도록 필요한 값만 받는다 */
export interface VocalDspValues {
  /** 음정 (-6 ~ +6 반음) — MR에만 적용 */
  keyOffset: number;
  /** 템포 (% 단위, 100 = 원속) — MR 재생 속도. 키는 보정 수식으로 유지된다 */
  tempoPercent: number;
  /** 에코 (0~100) — 목소리에만 적용 */
  echoLevel: number;
  /** MR 음량 (0~100) — 모니터·송출 양쪽에 반영 */
  mrVolumePercent: number;
  /** 마이크 음량 (0~100) — 모니터·송출 양쪽에 반영 */
  micVolumePercent: number;
}

export interface VocalAudioEngine {
  /** MR을 받아 디코드한다. 같은 URL로 다시 부르면 캐시를 재사용한다 */
  loadMr(url: string): Promise<void>;
  /** offsetSeconds부터 재생한다 (공연 재개용). 생략하면 처음부터 */
  startMr(offsetSeconds?: number): void;
  stopMr(): void;
  /**
   * MR이 끝까지 재생돼 스스로 멈추면 호출된다. stopMr()·dispose()로 멈춘 경우는 제외 —
   * 정상 종료와 중도 취소를 구분해야 하는 쪽(공연 종료 전송)이 이 신호를 쓴다.
   */
  setOnMrEnded(callback: (() => void) | null): void;
  /** deviceId가 빈 문자열이면 시스템 기본 장치를 연다 */
  openMic(deviceId: string): Promise<void>;
  closeMic(): void;
  applyDsp(values: VocalDspValues): void;
  /** 모니터 출력을 선택된 출력 장치로 보낸다. setSinkId 미지원이면 조용히 무시한다 */
  setOutputDevice(deviceId: string): Promise<void>;
  /** 송출 믹스(목소리 + MR). OpenVidu publisher에 이 스트림의 오디오 트랙을 넘긴다 */
  getBroadcastStream(): MediaStream;
  /**
   * 채점용 드라이 목소리 탭 (에코·음량 적용 전). MediaRecorder가 이 스트림을 녹음한다.
   * 마이크를 껐다 켜도 스트림 객체는 그대로라 녹음을 끊지 않아도 된다 — 닫힌 동안엔 무음이 흐른다.
   */
  getVocalCaptureStream(): MediaStream;
  /** 같은 드라이 목소리를 보는 분석 노드. 음정 수집이 여기서 시간 영역 데이터를 읽는다 */
  getVocalAnalyser(): AnalyserNode;
  /**
   * MR 재생 위치(ms). 정지 중이면 멈춘 위치를 그대로 준다.
   * 벽시계가 아니라 MR 시간축이라 템포 변경·재개 오프셋이 반영된다 — 정답 MIDI와 이 축이 맞는다.
   */
  getMrPositionMs(): number;
  /** 모니터링 지연(ms) = baseLatency + outputLatency. 측정 불가면 null */
  getLatencyMs(): number | null;
  dispose(): void;
}
