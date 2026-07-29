export type SongFilter = 'ALL' | 'RECOMMENDED' | 'POPULAR';

export interface SongSearchItem {
  songId: number;
  title: string;
  artist: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  favorite: boolean;
}

export interface SongSearchResult {
  items: SongSearchItem[];
  cursor: number | null;
}

/** 초 단위 길이를 "MM:SS" 표기로 변환한다. */
export function formatSongDuration(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
