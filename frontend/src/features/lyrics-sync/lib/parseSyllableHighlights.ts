import { SYLLABLE_LINE_CLEAR_GAP_MS } from '../config/lyricsSyncConfig';
import type { LyricsLine, SyllableTiming } from '../model/types';

/** midi.json의 syllable_highlights.syllables 항목에서 우리가 쓰는 필드 — 스네이크 케이스가 계약이다 */
interface RawSyllable {
  syllable: string;
  start_ms: number;
  end_ms: number;
  line: number;
}

function isRawSyllable(value: unknown): value is RawSyllable {
  if (typeof value !== 'object' || value === null) return false;

  const entry = value as Record<string, unknown>;

  return (
    typeof entry.syllable === 'string' &&
    entry.syllable !== '' &&
    typeof entry.start_ms === 'number' &&
    typeof entry.end_ms === 'number' &&
    typeof entry.line === 'number'
  );
}

/** midi.json 전체에서 음절 목록만 꺼낸다. 형식이 어긋나면 없는 것으로 친다 */
function extractSyllables(midiJson: unknown): RawSyllable[] | null {
  if (typeof midiJson !== 'object' || midiJson === null) return null;

  const highlights = (midiJson as { syllable_highlights?: unknown }).syllable_highlights;
  if (typeof highlights === 'undefined' || highlights === null) return null;
  if (typeof highlights !== 'object') return null;

  const { time_unit: timeUnit, syllables } = highlights as {
    time_unit?: unknown;
    syllables?: unknown;
  };

  // 단위가 명시돼 있는데 ms가 아니면 해석할 수 없다 — 어긋난 하이라이트를 흘리지 않는다.
  if (timeUnit !== undefined && timeUnit !== 'ms') return null;
  if (!Array.isArray(syllables)) return null;

  const valid = syllables.filter(isRawSyllable);

  return valid.length > 0 ? valid : null;
}

/**
 * 음절이 원문에서 제자리를 크게 벗어나 매칭되는 것을 막는 탐색 한도(문자 수).
 * 인식이 몇 글자를 놓쳐도 이 안에서는 복구되고, 후렴 반복처럼 한 절을 통째로
 * 건너뛰는 오매칭은 실패로 처리해 정렬 전체를 포기한다.
 */
const MAX_ALIGN_SKIP = 40;

/**
 * 음절 텍스트에는 띄어쓰기가 없으므로, 백엔드 가사 원문에 음절을 순서대로 맞춰
 * 공백·문장부호를 되살린 표시 텍스트를 만든다. 음절 사이에 있던 문자는 앞 음절에
 * 붙인다 (줄 첫 음절 앞의 문자는 이전 줄과의 경계라 버린다).
 *
 * 한 음절이라도 못 찾으면 null — 부분만 정렬된 어색한 결과 대신 원본 음절을 그대로 쓴다.
 */
function alignToPlainText(groups: RawSyllable[][], plainLyrics: string): string[][] | null {
  const haystack = plainLyrics.toLowerCase();
  let cursor = 0;

  const displays: string[][] = [];

  for (const group of groups) {
    const lineDisplays: string[] = [];

    for (const raw of group) {
      const found = haystack.indexOf(raw.syllable.toLowerCase(), cursor);
      if (found === -1 || found - cursor > MAX_ALIGN_SKIP) return null;

      if (lineDisplays.length > 0 && found > cursor) {
        // 원문의 줄바꿈이 표시 한 줄에 섞이지 않도록 공백류는 한 칸으로 접는다.
        lineDisplays[lineDisplays.length - 1] += plainLyrics
          .slice(cursor, found)
          .replace(/\s+/g, ' ');
      }

      lineDisplays.push(plainLyrics.slice(found, found + raw.syllable.length));
      cursor = found + raw.syllable.length;
    }

    displays.push(lineDisplays);
  }

  return displays;
}

/**
 * midi.json의 음절 하이라이트를 소절 목록으로 바꾼다. 없거나 형식이 어긋나면 null —
 * 호출부는 LRCLIB 조회로 폴백한다.
 *
 * 분석 파이프라인이 우리 MR 음원에서 직접 뽑은 타이밍이라 LRC 타임스탬프와 달리
 * 인트로 길이 보정이 필요 없고, 소절뿐 아니라 음절 단위 진행까지 표시할 수 있다.
 *
 * - line 값으로 소절을 묶고, 소절 시작은 첫 음절의 start로 한다.
 * - 가사 원문이 있으면 정렬로 띄어쓰기를 복원한다 (음절 텍스트에는 공백이 없다).
 * - 소절 사이가 SYLLABLE_LINE_CLEAR_GAP_MS 이상 비면 빈 줄을 넣는다 — LRC의 간주
 *   빈 줄에 해당하며, 지난 소절 내리기와 카운트다운이 여기 기대어 동작한다.
 */
export function parseSyllableHighlights(
  midiJson: unknown,
  plainLyrics: string | null,
): LyricsLine[] | null {
  const raw = extractSyllables(midiJson);
  if (raw === null) return null;

  const byLine = new Map<number, RawSyllable[]>();
  for (const entry of [...raw].sort((left, right) => left.start_ms - right.start_ms)) {
    const group = byLine.get(entry.line);

    if (group === undefined) {
      byLine.set(entry.line, [entry]);
    } else {
      group.push(entry);
    }
  }

  const groups = [...byLine.values()].sort((left, right) => left[0].start_ms - right[0].start_ms);
  const displays = plainLyrics === null ? null : alignToPlainText(groups, plainLyrics);

  const lines: LyricsLine[] = [];

  groups.forEach((group, groupIndex) => {
    const syllables: SyllableTiming[] = group.map((entry, entryIndex) => ({
      text: displays?.[groupIndex][entryIndex] ?? entry.syllable,
      startMs: entry.start_ms,
      endMs: entry.end_ms,
    }));

    lines.push({
      timeMs: syllables[0].startMs,
      text: syllables
        .map((syllable) => syllable.text)
        .join('')
        .trim(),
      syllables,
    });

    // 정렬 기준은 start라 마지막 원소가 가장 늦게 끝난다는 보장이 없다 (지속음 겹침).
    const lineEndMs = Math.max(...group.map((entry) => entry.end_ms));
    const nextStartMs = groups[groupIndex + 1]?.[0].start_ms;

    if (nextStartMs === undefined || nextStartMs - lineEndMs >= SYLLABLE_LINE_CLEAR_GAP_MS) {
      lines.push({ timeMs: lineEndMs, text: '' });
    }
  });

  return lines;
}
