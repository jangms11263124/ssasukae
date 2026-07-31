import { apiClient } from '@/shared/api/client';

export interface UploadAdminSongRequest {
  title: string;
  artist: string;
  /** 원곡 음원 (.wav) */
  wavFile: File;
  /** 썸네일 이미지 (.png) */
  pngFile: File | null;
  /** 가사 텍스트 (.txt) */
  txtFile: File | null;
}

/**
 * 곡 등록 (POST /api/admin/songs, multipart)
 * 백엔드 미구현 상태 — multipart 필드명과 응답 DTO는 백엔드 완성 후 실제 구현 기준으로 확인 필요.
 */
export function uploadAdminSong(request: UploadAdminSongRequest): Promise<void> {
  const formData = new FormData();
  formData.append('title', request.title);
  formData.append('artist', request.artist);
  formData.append('wavFile', request.wavFile);

  if (request.pngFile) {
    formData.append('pngFile', request.pngFile);
  }
  if (request.txtFile) {
    formData.append('txtFile', request.txtFile);
  }

  return apiClient<void>('/api/admin/songs', {
    method: 'POST',
    body: formData,
    auth: true,
  });
}
