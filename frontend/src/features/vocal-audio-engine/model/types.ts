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
  startMr(): void;
  stopMr(): void;
  /** deviceId가 빈 문자열이면 시스템 기본 장치를 연다 */
  openMic(deviceId: string): Promise<void>;
  closeMic(): void;
  applyDsp(values: VocalDspValues): void;
  /** 모니터 출력을 선택된 출력 장치로 보낸다. setSinkId 미지원이면 조용히 무시한다 */
  setOutputDevice(deviceId: string): Promise<void>;
  /** 송출 믹스(목소리 + MR). OpenVidu publisher에 이 스트림의 오디오 트랙을 넘긴다 */
  getBroadcastStream(): MediaStream;
  /** 모니터링 지연(ms) = baseLatency + outputLatency. 측정 불가면 null */
  getLatencyMs(): number | null;
  dispose(): void;
}
