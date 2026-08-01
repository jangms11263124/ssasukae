export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: number;
  email: string;
  nickname: string;
  profileImageUrl: string | null;
  role: UserRole;
}

export interface AuthTokenResponse {
  accessToken: string;
  user: User;
}

export interface TokenReissueResponse {
  accessToken: string;
}

export interface OAuthSignupRequest {
  signupToken: string;
  nickname?: string;
  profileImageUrl?: string;
}

export interface SignupTokenClaims {
  purpose?: string;
  provider?: string;
  providerId?: string;
  email?: string;
  nickname?: string;
  profileImageUrl?: string;
}

export interface NicknameCheckResponse {
  available: boolean;
}

export interface ProfileImageChangeResponse {
  url: string;
}

export type OAuthProvider = 'GOOGLE' | 'KAKAO';

export interface FavoriteSongItem {
  songId: number;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
}

export interface RecentPerformance {
  performanceId: number;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  score: number;
  /** 서버 LocalDateTime — "2026-07-22T14:59:27.965355" (오프셋 없음) */
  performanceAt: string;
}

export interface MyPageResponse {
  userId: number;
  nickname: string;
  provider: OAuthProvider;
  email: string;
  profileImageUrl: string | null;
  createdAt: string;
  favorites: {
    count: number;
    items: FavoriteSongItem[];
  };
  recentPerformances: RecentPerformance[];
}

export interface PerformanceStatResponse {
  avgScore: number;
  /** 이전 대비 증감. 디자인상 퍼센트로 표기한다 */
  difference: number;
  totalSongs: number;
  updatedAt: string;
}
