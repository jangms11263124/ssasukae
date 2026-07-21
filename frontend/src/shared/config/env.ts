const DEFAULT_API_URL = 'http://localhost:8080';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? DEFAULT_API_URL;

export const OAUTH_GOOGLE_URL = `${API_BASE_URL}/oauth2/authorization/google`;

export const OAUTH_KAKAO_URL = `${API_BASE_URL}/oauth2/authorization/kakao`;