/**
 * 마이페이지 미리보기 목록의 최대 표시 개수.
 * 서버 응답 계약이 바뀌어도 카드가 길어지지 않게 같은 값으로 방어한다.
 * 찜은 서버가 최근 6개(findRecentFavor LIMIT 6), 최근 활동은 3개를 내려줘 서로 다르다.
 */
export const FAVORITES_PREVIEW_COUNT = 6;
export const ACTIVITY_PREVIEW_COUNT = 3;
