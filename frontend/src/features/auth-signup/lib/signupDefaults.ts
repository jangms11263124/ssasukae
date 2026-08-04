import type { SignupTokenClaims } from '@/entities/user';

/** 토큰 파싱 결과를 회원가입 폼 초기값으로 변환하는 서버/클라이언트 공용 함수. */
export function getSignupDefaults(claims: SignupTokenClaims | null) {
  return {
    socialNickname: claims?.nickname ?? '',
    profileImageUrl: claims?.profileImageUrl ?? undefined,
  };
}
