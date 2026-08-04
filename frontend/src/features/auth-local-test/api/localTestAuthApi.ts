import type { AuthTokenResponse } from '@/entities/user';
import { apiClient } from '@/shared/api/client';

export interface LocalTestLoginRequest {
  loginId: string;
  password: string;
}

export interface LocalTestSignupRequest extends LocalTestLoginRequest {
  nickname: string;
}

export function loginLocalTestAccount(request: LocalTestLoginRequest) {
  return apiClient<AuthTokenResponse>('/api/auth/test/login', {
    method: 'POST',
    body: request,
  });
}

export function signupLocalTestAccount(request: LocalTestSignupRequest) {
  return apiClient<AuthTokenResponse>('/api/auth/test/signup', {
    method: 'POST',
    body: request,
  });
}
