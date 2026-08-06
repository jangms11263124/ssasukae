import type { SoundTouchNode } from '@soundtouchjs/audio-worklet';

import {
  SOUNDTOUCH_OVERLAP_MS,
  SOUNDTOUCH_PROCESSOR_URL,
} from '../config/audioEngineConfig';

export { SOUNDTOUCH_PROCESSOR_URL };

export async function registerSoundTouchWorklet(context: AudioContext): Promise<void> {
  const { SoundTouchNode } = await import('@soundtouchjs/audio-worklet');
  await SoundTouchNode.register(context, SOUNDTOUCH_PROCESSOR_URL);
}

export async function createSoundTouchMrNode(context: AudioContext): Promise<SoundTouchNode> {
  const { SoundTouchNode } = await import('@soundtouchjs/audio-worklet');
  return new SoundTouchNode({ context });
}

export async function decodeMrBuffer(context: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MR fetch failed: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return context.decodeAudioData(arrayBuffer);
}

/** 100%가 아닐 때만 WSOLA time-stretching을 쓴다 */
export function shouldUseSoundTouchStretch(tempoPercent: number): boolean {
  return tempoPercent !== 100;
}

/** 템포만 SoundTouch로 처리한다. 키는 PitchShift가 담당한다 */
export function applySoundTouchTempoParams(
  source: AudioBufferSourceNode | null,
  stNode: SoundTouchNode,
  tempoPercent: number,
): void {
  const speedMultiplier = Math.max(0.01, tempoPercent / 100);

  if (source !== null) {
    source.playbackRate.value = speedMultiplier;
  }

  stNode.playbackRate.value = speedMultiplier;
  stNode.pitch.value = 1;
  stNode.pitchSemitones.value = 0;
  stNode.setStretchParameters({ overlapMs: SOUNDTOUCH_OVERLAP_MS });
}
