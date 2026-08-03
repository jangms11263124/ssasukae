import { apiClient } from '@/shared/api/client';
import { OAUTH_GOOGLE_URL, OAUTH_KAKAO_URL } from '@/shared/config/env';

import type {
  AuthTokenResponse,
  OAuthSignupRequest,
  TokenReissueResponse,
  User,
} from '../types';

export function getCurrentUser(signal?: AbortSignal) {
  const timeoutSignal = AbortSignal.timeout(5_000);
  const requestSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  return apiClient<User>('/api/users/me', { auth: true, signal: requestSignal });
}

export function signup(request: OAuthSignupRequest) {
  return apiClient<AuthTokenResponse>('/api/auth/signup', {
    method: 'POST',
    body: request,
  });
}

export function refreshAccessToken(signal?: AbortSignal) {
  return apiClient<TokenReissueResponse>('/api/auth/refresh', {
    method: 'POST',
    signal,
  });
}

export function logout() {
  return apiClient<void>('/api/auth/logout', {
    method: 'POST',
    auth: true,
  });
}

export function startGoogleOAuth() {
  window.location.assign(OAUTH_GOOGLE_URL);
}

export function startKakaoOAuth() {
  window.location.assign(OAUTH_KAKAO_URL);
}
