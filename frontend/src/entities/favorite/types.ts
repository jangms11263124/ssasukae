export interface FavoriteSong {
  songId: number;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  favoritedAt: string;
  /** 백엔드 추가 예정 필드. 응답에 없는 동안은 재생 시간 칩을 숨긴다. */
  durationSeconds?: number;
}

export interface FavoriteSongPage {
  totalCount: number;
  songs: FavoriteSong[];
  nextCursor: number | null;
}

/** "2026-07-20T12:00:00" → "2026.07.20" */
export function formatFavoritedAt(favoritedAt: string): string {
  return favoritedAt.slice(0, 10).replaceAll('-', '.');
}
