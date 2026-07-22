export const BRAND_NAME = '싸스케';
export const BRAND_TAGLINE = '실시간 화상 노래방';
export const BRAND_LOGO_SRC = '/images/brand/logo.png';

export const HERO_COPY = {
  headlineBefore: '노래해봐,',
  headlineAccent: '우린 기다려줄 생각 없어',
  description: '노래는 한 명, 훼방은 전원. 버틸 수 있을까?',
} as const;

export const LOGIN_COPY = {
  title: '소셜 로그인으로 지금 바로 입장하세요.',
  description: '지금 바로 입장하기',
  activeUsers: (count: number) => `지금도 ${count}명이 즐기고 있습니다`,
} as const;
