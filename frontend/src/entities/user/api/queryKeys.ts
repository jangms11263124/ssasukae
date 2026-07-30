export const userQueryKeys = {
  all: ['user'] as const,
  me: () => [...userQueryKeys.all, 'me'] as const,
  myPage: () => [...userQueryKeys.all, 'mypage'] as const,
  performanceStat: () => [...userQueryKeys.all, 'performance-stat'] as const,
};
