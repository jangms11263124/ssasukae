import { useEffect, useState } from 'react';

import { SYLLABLE_TICK_INTERVAL_MS, type SyllableTiming } from '@/features/lyrics-sync';
import { cn } from '@/shared/lib/cn';

interface LyricsOverlayProps {
  currentLine: string;
  /** 현재 소절의 음절 타이밍. 없으면(LRCLIB 폴백) 소절 전체를 흰색으로만 띄운다 */
  syllables?: SyllableTiming[] | null;
  nextLine?: string;
  /** 음절 하이라이트가 읽는 재생 시계(ms). syllables가 있을 때만 쓴다 */
  getTimeMs?: () => number;
}

const SHADOW = 'drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]';

/**
 * 부른 만큼 색이 바뀐 음절 수. 컨텍스트가 아니라 이 말단에서 직접 틱을 돌린다 —
 * 음절 진행을 컨텍스트에 실으면 음절마다 무대 전체가 리렌더된다.
 *
 * 소절이 바뀌면 결과를 버려야 하므로 어느 소절의 값인지 함께 들고, 렌더 때 지금
 * 소절과 맞춰 본다 (효과 안에서 setState로 리셋하지 않는 코드베이스 공통 패턴).
 */
function useSungSyllableCount(
  syllables: SyllableTiming[] | null | undefined,
  getTimeMs: (() => number) | undefined,
): number {
  const [sung, setSung] = useState<{ syllables: SyllableTiming[]; count: number } | null>(null);

  useEffect(() => {
    if (syllables == null || syllables.length === 0 || getTimeMs === undefined) return;

    const tick = () => {
      const timeMs = getTimeMs();

      let count = 0;
      while (count < syllables.length && syllables[count].startMs <= timeMs) count += 1;

      // 같은 값이면 이전 객체를 돌려줘 리렌더를 건너뛴다.
      setSung((prev) =>
        prev?.syllables === syllables && prev.count === count ? prev : { syllables, count },
      );
    };

    const intervalId = setInterval(tick, SYLLABLE_TICK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [syllables, getTimeMs]);

  return sung !== null && sung.syllables === syllables ? sung.count : 0;
}

/**
 * 소절 단위 가사 표시. 지금 부를 소절을 박스로 강조하고 다음 소절을 아래에 흐리게 둔다.
 *
 * midi.json이 음절 타이밍(syllable_highlights)을 주는 곡은 부른 음절부터 차례로
 * 색을 입힌다. 없는 곡(LRCLIB 폴백)은 소절 단위로만 넘긴다 — LRC 타임스탬프로는
 * 음절 위치를 추측밖에 할 수 없고 어긋나면 오히려 부르기 어려워진다.
 *
 * 한글 가사라 대문자·이탤릭은 쓰지 않는다 (한글에서는 읽기만 나빠진다).
 */
export function LyricsOverlay({ currentLine, syllables, nextLine, getTimeMs }: LyricsOverlayProps) {
  const sungCount = useSungSyllableCount(syllables, getTimeMs);

  return (
    <div className="absolute inset-x-0 bottom-10 flex flex-col items-center gap-2 px-6 text-center">
      {/*
        간주 구간에는 현재 소절이 비어 있다. 이때 요소를 빼면 아래 소절이 밀려 올라가
        가사가 출렁이므로, 자리는 그대로 두고 보이지만 않게 한다.
      */}
      <p
        className={cn(
          'px-4 py-1.5 text-3xl font-bold leading-tight text-white',
          SHADOW,
          currentLine ? 'bg-slate-800/80' : 'invisible',
        )}
      >
        {syllables != null && syllables.length > 0
          ? syllables.map((syllable, index) => (
              <span
                key={index}
                className={cn(
                  'transition-colors duration-150',
                  index < sungCount && 'text-cyan-300',
                )}
              >
                {syllable.text}
              </span>
            ))
          : currentLine || ' '}
      </p>
      <p className={cn('text-2xl font-bold leading-tight text-zinc-400/80', SHADOW)}>
        {nextLine || ' '}
      </p>
    </div>
  );
}
