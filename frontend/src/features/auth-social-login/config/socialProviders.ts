export type SocialProvider = 'google' | 'kakao';

interface SocialProviderConfig {
  id: SocialProvider;
  label: string;
  iconSrc: string;
}

export const SOCIAL_PROVIDERS: readonly SocialProviderConfig[] = [
  {
    id: 'google',
    label: 'LOGIN_WITH_GOOGLE',
    iconSrc: '/images/icons/google_logo.png',
  },
  {
    id: 'kakao',
    label: 'LOGIN_WITH_KAKAO',
    iconSrc: '/images/icons/kakao_logo.png',
  },
] as const;

export const DEFAULT_ACTIVE_USER_COUNT = 16;
