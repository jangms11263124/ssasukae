export const favoriteQueryKeys = {
  all: ['favorites'] as const,
  list: (query: string) => [...favoriteQueryKeys.all, 'list', query] as const,
};
