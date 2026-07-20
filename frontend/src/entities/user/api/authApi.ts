import { apiClient } from '@/shared/api/client';
import { OAUTH_GOOGLE_URL } from '@/shared/config/env';

import type {
  AuthTokenResponse,
  OAuthSignupRequest,
  TokenReissueResponse,
  User,
} from '../types';

export function getCurrentUser() {
  return apiClient<User>('/api/users/me', { auth: true });
}

export function signup(request: OAuthSignupRequest) {
  return apiClient<AuthTokenResponse>('/api/auth/signup', {
    method: 'POST',
    body: request,
  });
}

export function refreshAccessToken() {
  return apiClient<TokenReissueResponse>('/api/auth/refresh', {
    method: 'POST',
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
