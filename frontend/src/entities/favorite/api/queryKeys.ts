export const favoriteQueryKeys = {
  all: ['favorites'] as const,
  list: (query: string) => [...favoriteQueryKeys.all, 'list', query] as const,
  // 찜 토글이 all을 invalidate해도 보고 있는 상세가 NOT_FOUND로 뒤집히지 않도록 별도 루트를 쓴다.
  detail: (songId: number) => ['favoriteSongDetail', songId] as const,
};
