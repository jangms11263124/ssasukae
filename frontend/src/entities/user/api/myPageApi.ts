import { apiClient } from '@/shared/api/client';

import type {
  MyPageResponse,
  PerformanceStatResponse,
  ProfileImageChangeResponse,
} from '../types';

/** 마이페이지 조회 (GET /api/users/me/mypage) */
export function getMyPage() {
  return apiClient<MyPageResponse>('/api/users/me/mypage', { auth: true });
}

/**
 * 공연 통계 갱신 (PATCH /api/users/me/reperformance)
 *
 * 조회가 아니라 갱신이므로 화면 진입 시 자동으로 호출하지 않는다.
 * 사용자가 갱신 버튼을 눌렀을 때만 실행한다.
 */
export function refreshPerformanceStat() {
  return apiClient<PerformanceStatResponse>('/api/users/me/reperformance', {
    method: 'PATCH',
    auth: true,
  });
}

/** 프로필 이미지 변경 (POST /api/users/me/profile-image) — 업로드된 이미지의 공개 URL을 돌려준다 */
export function changeProfileImage(file: File) {
  const formData = new FormData();
  // 파트 이름은 서버 @RequestPart("profile-image")와 일치해야 한다.
  formData.append('profile-image', file);

  return apiClient<ProfileImageChangeResponse>('/api/users/me/profile-image', {
    method: 'POST',
    body: formData,
    auth: true,
  });
}

/** 닉네임 변경 (PATCH /api/users/me/nickname) — 204 No Content */
export function changeNickname(nickname: string) {
  return apiClient<void>('/api/users/me/nickname', {
    method: 'PATCH',
    body: { nickname: nickname.trim() },
    auth: true,
  });
}
