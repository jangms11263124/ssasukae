import type { LyricsLine } from '../model/types';

// [mm:ss.xx] / [mm:ss.xxx] / [mm:ss] 모두 허용한다. LRCLIB은 보통 centisecond 2자리로 준다.
const TIMESTAMP_PATTERN = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

function toMs(minutes: string, seconds: string, fraction: string | undefined): number {
  // ".5"는 500ms, ".50"은 500ms, ".500"도 500ms — 자리수를 3으로 맞춰야 소수점 의미가 유지된다.
  const millis = fraction === undefined ? 0 : Number(fraction.padEnd(3, '0').slice(0, 3));

  return Number(minutes) * 60_000 + Number(seconds) * 1_000 + millis;
}

/**
 * LRC 원문을 시간순 소절 목록으로 바꾼다.
 *
 * - `[ar:]` `[ti:]` 같은 메타 태그 줄은 타임스탬프가 아니라 걸러진다.
 * - 한 줄에 타임스탬프가 여러 개면(반복되는 후렴) 같은 가사를 시각마다 하나씩 펼친다.
 * - 가사가 빈 줄은 버리지 않는다 — 간주가 시작되는 시점을 알려주는 신호라서,
 *   직전 소절을 언제까지 띄울지 정하는 데 쓴다.
 */
export function parseLrc(lrc: string): LyricsLine[] {
  const lines: LyricsLine[] = [];

  for (const rawLine of lrc.split('\n')) {
    TIMESTAMP_PATTERN.lastIndex = 0;

    const timestamps: number[] = [];
    let textStart = 0;
    let match: RegExpExecArray | null;

    while ((match = TIMESTAMP_PATTERN.exec(rawLine)) !== null) {
      // 타임스탬프는 줄 맨 앞에 연달아 붙는다. 떨어져 나오면 가사 본문에 섞인 대괄호다.
      if (match.index !== textStart) break;

      textStart = match.index + match[0].length;
      timestamps.push(toMs(match[1], match[2], match[3]));
    }

    if (timestamps.length === 0) continue;

    const text = rawLine.slice(textStart).trim();
    for (const timeMs of timestamps) {
      lines.push({ timeMs, text });
    }
  }

  // 여러 타임스탬프를 펼치면 순서가 흐트러진다. 이후 탐색이 정렬을 전제로 한다.
  return lines.sort((left, right) => left.timeMs - right.timeMs);
}

/**
 * timeMs 시점에 진행 중인 소절의 인덱스. 첫 소절보다 이르면 -1.
 * 매 프레임 호출되므로 선형 탐색 대신 이진 탐색을 쓴다.
 */
export function findLineIndexAt(lines: LyricsLine[], timeMs: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;

    if (lines[mid].timeMs <= timeMs) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return found;
}

/** fromIndex 다음으로 가사가 있는 소절의 인덱스. 없으면 -1 (간주 줄은 건너뛴다) */
export function findNextTextIndex(lines: LyricsLine[], fromIndex: number): number {
  for (let index = fromIndex + 1; index < lines.length; index += 1) {
    if (lines[index].text !== '') return index;
  }

  return -1;
}
