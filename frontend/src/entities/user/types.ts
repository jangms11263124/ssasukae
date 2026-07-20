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
