import { AI_BASE_URL } from '@/shared/config/env';

import type { SingerMidiJson } from '../model/types';

export interface FinalScoreRequest {
  performanceId: number;
  songId: number;
  userId: number;
  /** 0~100. 범위를 벗어나면 AI가 400으로 거절한다 */
  difficultyScore: number;
  lyrics: string;
  transcript: string;
  /** 분석 파이프라인이 만든 정답 MIDI JSON. 내려받은 그대로 넘긴다 */
  referenceMidi: Blob;
  singerMidi: SingerMidiJson;
}

function jsonFile(value: unknown, fileName: string): File {
  return new File([JSON.stringify(value)], fileName, { type: 'application/json' });
}

/**
 * 정답·가창 MIDI와 가사·STT 결과를 AI 채점에 넘긴다.
 * 응답 본문은 비어 있다 — 점수는 AI가 Spring에 콜백하고, Spring이 LEADERBOARD_UPDATED로
 * 방 전체에 브로드캐스트한다.
 */
export async function submitFinalScore(request: FinalScoreRequest): Promise<void> {
  const body = new FormData();
  body.append('referenceMidi', request.referenceMidi, 'reference.json');
  body.append('singerMidi', jsonFile(request.singerMidi, 'singer.json'));
  body.append('lyrics', request.lyrics);
  body.append('transcript', request.transcript);
  body.append('difficultyScore', String(request.difficultyScore));
  body.append('songId', String(request.songId));
  body.append('userId', String(request.userId));

  const response = await fetch(
    `${AI_BASE_URL}/api/v1/score/final/${request.performanceId}`,
    { method: 'POST', body },
  );

  if (!response.ok) {
    throw new Error(`최종 채점 요청 실패 (${response.status})`);
  }
}

/** 정답 MIDI는 파싱하지 않고 통째로 넘기므로 Blob 그대로 받는다 */
export async function fetchReferenceMidi(url: string): Promise<Blob> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`정답 MIDI를 불러오지 못했습니다 (${response.status})`);
  }

  return response.blob();
}

/** 관리자가 올린 가사 .txt를 그대로 읽는다 */
export async function fetchLyricsText(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`가사를 불러오지 못했습니다 (${response.status})`);
  }

  return response.text();
}
