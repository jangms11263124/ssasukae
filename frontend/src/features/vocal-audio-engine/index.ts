// createVocalAudioEngine(Tone.js 포함)은 일부러 재노출하지 않는다 —
// 훅 내부의 동적 import로만 로드해 메인 번들에서 Tone.js를 제외한다.
export type { VocalAudioEngine, VocalDspValues } from './model/types';
export { useVocalAudioEngine } from './model/useVocalAudioEngine';
export type {
  UseVocalAudioEngineOptions,
  VocalAudioEngineState,
} from './model/useVocalAudioEngine';
