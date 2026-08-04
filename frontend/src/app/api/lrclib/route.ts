import { NextResponse, type NextRequest } from 'next/server';

import {
  DURATION_TOLERANCE_SEC,
  LRCLIB_BASE_URL,
  LRCLIB_CLIENT,
  LYRICS_CACHE_SECONDS,
  MAX_CANDIDATES,
  SEARCH_DELAY_MS,
  type LyricsCandidate,
  type LyricsLookupResponse,
} from '@/features/lyrics-sync';

/**
 * LRCLIB 가사 조회 프록시.
 *
 * 브라우저에서 직접 부르지 않는 이유:
 *  - LRCLIB은 무인증 무료 서비스라 클라이언트 식별을 요구한다. 브라우저는 User-Agent를
 *    바꿀 수 없지만 서버는 그대로 보낼 수 있다.
 *  - 한 방의 참가자 전원이 같은 곡을 동시에 조회한다. 여기서 캐시하면 외부 요청이 곡당 1회로 줄어
 *    문서가 요구하는 "서버에 부담 주지 않는" 사용이 된다.
 *  - LRCLIB의 CORS 허용 여부에 의존하지 않는다.
 *
 * 같은 /api 아래에 백엔드로 넘기는 [...path] 프록시가 있지만, Next는 정적 세그먼트를
 * catch-all보다 먼저 매칭하므로 /api/lrclib은 이 핸들러가 받는다.
 */

interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  duration: number | null;
  instrumental: boolean;
  syncedLyrics: string | null;
}

type SearchOutcome =
  | { ok: true; records: LrclibRecord[] }
  | { ok: false; status: number; retryAfter: string | null };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchLrclib(query: Record<string, string>): Promise<SearchOutcome> {
  const url = `${LRCLIB_BASE_URL}/api/search?${new URLSearchParams(query).toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': LRCLIB_CLIENT },
      // 가사는 바뀌지 않는다. 같은 곡의 두 번째 조회부터는 외부로 나가지 않는다.
      next: { revalidate: LYRICS_CACHE_SECONDS },
    });
  } catch (error) {
    // 외부 서비스 장애·네트워크 차단으로 fetch 자체가 실패할 수 있다.
    // 가사는 공연의 부가 기능이라, 여기서 터뜨려 500을 내는 대신 "없음"으로 넘긴다.
    console.error('[lrclib] 검색 요청 실패', error);

    return { ok: false, status: 502, retryAfter: null };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      retryAfter: response.headers.get('Retry-After'),
    };
  }

  try {
    return { ok: true, records: (await response.json()) as LrclibRecord[] };
  } catch (error) {
    console.error('[lrclib] 응답 파싱 실패', error);

    return { ok: false, status: 502, retryAfter: null };
  }
}

/** 길이 차이가 작은 순. 길이를 모르는 후보는 뒤로 밀되 버리지는 않는다 */
function durationGap(record: LrclibRecord, targetSeconds: number | null): number {
  if (targetSeconds === null) return 0;
  if (record.duration === null) return Number.MAX_SAFE_INTEGER;

  return Math.abs(record.duration - targetSeconds);
}

function toCandidate(record: LrclibRecord): LyricsCandidate {
  return {
    id: record.id,
    trackName: record.trackName,
    artistName: record.artistName,
    duration: record.duration,
    instrumental: record.instrumental,
    syncedLyrics: record.syncedLyrics,
  };
}

/**
 * 타임스탬프가 있는 레코드만 남기고 곡 길이가 가까운 순으로 세운다.
 * 허용 오차 안에 드는 후보가 있으면 그 안에서만 고른다 — 길이가 맞는 쪽이
 * 같은 편곡일 가능성이 높아서다.
 */
function rankCandidates(records: LrclibRecord[], targetSeconds: number | null): LyricsCandidate[] {
  const synced = records.filter(
    (record) => !record.instrumental && (record.syncedLyrics?.trim() ?? '') !== '',
  );

  const withGap = synced
    .map((record) => ({ record, gap: durationGap(record, targetSeconds) }))
    .sort((left, right) => left.gap - right.gap);

  const withinTolerance = withGap.filter((entry) => entry.gap <= DURATION_TOLERANCE_SEC);
  const chosen = withinTolerance.length > 0 ? withinTolerance : withGap;

  return chosen.slice(0, MAX_CANDIDATES).map((entry) => toCandidate(entry.record));
}

function jsonWithCache(body: LyricsLookupResponse): NextResponse {
  return NextResponse.json(body, {
    headers: { 'Cache-Control': `public, max-age=${LYRICS_CACHE_SECONDS}` },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const title = searchParams.get('title')?.trim() ?? '';
  const artist = searchParams.get('artist')?.trim() ?? '';
  const parsedDuration = Number(searchParams.get('duration'));
  const duration =
    Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null;

  if (title === '') {
    return NextResponse.json({ message: 'title 파라미터가 필요합니다.' }, { status: 400 });
  }

  // 제목+가수로 먼저 좁히고, 빈손이면 제목만으로 넓혀 다시 찾는다.
  const attempts: Record<string, string>[] =
    artist === ''
      ? [{ track_name: title }]
      : [{ track_name: title, artist_name: artist }, { track_name: title }];

  let sawRecords = false;

  for (const [index, query] of attempts.entries()) {
    // 문서 권장: 요청은 순차로 보내고 사이에 짧은 간격을 둔다.
    if (index > 0) await delay(SEARCH_DELAY_MS);

    const outcome = await searchLrclib(query);

    if (!outcome.ok) {
      // 429는 Retry-After를 지켜야 한다. 여기서 재시도하지 않고 그대로 알린다.
      const headers = new Headers();
      if (outcome.retryAfter !== null) headers.set('Retry-After', outcome.retryAfter);

      return NextResponse.json(
        { candidates: [], reason: 'RATE_LIMITED' } satisfies LyricsLookupResponse,
        { status: outcome.status === 429 ? 429 : 502, headers },
      );
    }

    if (outcome.records.length === 0) continue;

    sawRecords = true;
    const candidates = rankCandidates(outcome.records, duration);

    if (candidates.length > 0) {
      return jsonWithCache({ candidates });
    }
  }

  // 곡은 찾았는데 타임스탬프가 없는 경우와 아예 없는 경우를 구분해 안내 문구를 다르게 한다.
  return jsonWithCache({
    candidates: [],
    reason: sawRecords ? 'NO_SYNCED_LYRICS' : 'NOT_FOUND',
  });
}
