import { ApiError, apiClient } from '@/shared/api/client';

interface AdminUploadTicketResponse {
  ticket: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface UploadAdminSongRequest {
  title: string;
  artist: string;
  /** 분석할 원곡 (.mp3) */
  originalMp3: File;
  /** 앨범 이미지 (.jpg, .jpeg, .png, .webp) */
  albumImg: File;
  /** 가사 파일 (.txt, .lrc, .json) */
  lyrics: File;
}

export interface UploadAdminSongResponse {
  jobId: string;
  status: 'accepted';
}

function getAiUploadErrorMessage(status: number): string {
  if (status === 401) return '업로드 인증이 만료됐어요. 다시 시도해 주세요.';
  if (status === 403) return '곡 등록 권한을 확인하지 못했어요.';
  if (status === 413) return '첨부 파일의 용량 제한을 초과했어요.';
  if (status === 400 || status === 422) return '입력 내용과 첨부 파일 형식을 확인해 주세요.';
  return 'AI 서버에서 곡 분석 요청을 접수하지 못했어요.';
}

function getAiServerUrl(): string {
  const aiServerUrl = process.env.NEXT_PUBLIC_AI_SERVER_URL?.trim().replace(/\/$/, '');

  if (!aiServerUrl) {
    throw new ApiError('AI 서버 주소가 설정되지 않았어요.', 500);
  }

  return aiServerUrl;
}

function isUploadAcceptedResponse(value: unknown): value is UploadAdminSongResponse {
  if (!value || typeof value !== 'object') return false;

  const response = value as Record<string, unknown>;
  return (
    typeof response.jobId === 'string' &&
    UUID_PATTERN.test(response.jobId) &&
    response.status === 'accepted'
  );
}

/** 백엔드에서 관리자 업로드 티켓을 발급받은 뒤 AI 서버에 분석을 직접 요청한다. */
export async function uploadAdminSong(
  request: UploadAdminSongRequest,
): Promise<UploadAdminSongResponse> {
  const { ticket } = await apiClient<AdminUploadTicketResponse>(
    '/api/admin/songs/upload-ticket',
    {
      method: 'POST',
      auth: true,
    },
  );

  if (!ticket) {
    throw new ApiError('업로드 인증 정보를 발급받지 못했어요.', 500);
  }

  const formData = new FormData();
  formData.append('title', request.title);
  formData.append('artist', request.artist);
  formData.append('ticket', ticket);
  formData.append('originalMp3', request.originalMp3);
  formData.append('albumImg', request.albumImg);
  formData.append('lyrics', request.lyrics);

  const response = await fetch(`${getAiServerUrl()}/api/admin/songs`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new ApiError(getAiUploadErrorMessage(response.status), response.status);
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new ApiError('AI 서버의 응답을 확인하지 못했어요.', response.status);
  }

  if (response.status !== 202 || !isUploadAcceptedResponse(responseBody)) {
    throw new ApiError('AI 서버의 응답 형식이 올바르지 않아요.', response.status);
  }

  return responseBody;
}
