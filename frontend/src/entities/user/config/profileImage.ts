/** 서버 UserService.ALLOWED_PROFILE_IMAGE_TYPES와 동일한 목록 */
export const PROFILE_IMAGE_ALLOWED_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const PROFILE_IMAGE_ACCEPT = PROFILE_IMAGE_ALLOWED_TYPES.join(',');

/** 서버가 multipart 한도를 명시하지 않아 Spring 기본값(1MB)을 따른다 */
export const PROFILE_IMAGE_MAX_SIZE_BYTES = 1024 * 1024;

/** 안내 문구용 표기 — 위 허용 목록·한도가 바뀌면 함께 갱신한다 */
export const PROFILE_IMAGE_TYPE_LABEL = 'JPEG·PNG·WEBP';
export const PROFILE_IMAGE_MAX_SIZE_LABEL = '1MB';
