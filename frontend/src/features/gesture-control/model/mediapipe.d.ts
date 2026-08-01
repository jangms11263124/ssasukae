// MediaPipe Hands는 CDN 스크립트로 로드되므로 window 전역 타입을 직접 선언한다.
// import/export가 없어야 전역 선언으로 병합된다.

interface MpLandmark {
  x: number;
  y: number;
  z?: number;
}

interface MpHandedness {
  label: 'Left' | 'Right';
  score: number;
}

interface MpResults {
  multiHandLandmarks?: MpLandmark[][];
  multiHandedness?: MpHandedness[];
}

interface MpHandsOptions {
  maxNumHands: number;
  modelComplexity: 0 | 1;
  minDetectionConfidence: number;
  minTrackingConfidence: number;
  selfieMode: boolean;
}

interface MpHands {
  setOptions(options: MpHandsOptions): void;
  onResults(callback: (results: MpResults) => void): void;
  send(input: { image: HTMLVideoElement }): Promise<void>;
  close(): Promise<void>;
}

interface Window {
  Hands?: new (config: { locateFile: (file: string) => string }) => MpHands;
}
