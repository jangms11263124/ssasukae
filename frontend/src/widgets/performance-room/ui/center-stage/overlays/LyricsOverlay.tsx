import { useEffect, useState, type CSSProperties } from 'react';

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

/**
 * 배경 박스 없이 캠 영상 위에 글자만 얹으므로, 밝은 화면에서도 읽히도록
 * 가까운 진한 그림자부터 넓게 퍼지는 그림자까지 3겹을 쌓는다. 한 겹으로는
 * 밝은 배경에서 흰 글자가 씻겨 나간다.
 */
const SHADOW =
  'drop-shadow-[0_1px_2px_rgba(0,0,0,0.95),0_2px_6px_rgba(0,0,0,0.85),0_4px_16px_rgba(0,0,0,0.7)]';

interface SungProgress {
  /** startMs가 지난 음절 수 */
  count: number;
  /** count가 이 값이 된 시점의 재생 시각. 진행 중 음절의 애니메이션 위치 보정에 쓴다 */
  timeMs: number;
}

/**
 * 발성이 시작된 음절 수와 그 시점의 재생 시각. 컨텍스트가 아니라 이 말단에서 직접
 * 틱을 돌린다 — 음절 진행을 컨텍스트에 실으면 음절마다 무대 전체가 리렌더된다.
 *
 * 소절이 바뀌면 결과를 버려야 하므로 어느 소절의 값인지 함께 들고, 렌더 때 지금
 * 소절과 맞춰 본다 (효과 안에서 setState로 리셋하지 않는 코드베이스 공통 패턴).
 */
function useSungProgress(
  syllables: SyllableTiming[] | null | undefined,
  getTimeMs: (() => number) | undefined,
): SungProgress | null {
  const [sung, setSung] = useState<(SungProgress & { syllables: SyllableTiming[] }) | null>(null);

  useEffect(() => {
    if (syllables == null || syllables.length === 0 || getTimeMs === undefined) return;

    const tick = () => {
      const timeMs = getTimeMs();

      let count = 0;
      while (count < syllables.length && syllables[count].startMs <= timeMs) count += 1;

      // count가 그대로면 이전 객체를 돌려줘 리렌더를 건너뛴다 (timeMs는 count가 바뀔 때만 갱신).
      setSung((prev) =>
        prev?.syllables === syllables && prev.count === count
          ? prev
          : { syllables, count, timeMs },
      );
    };

    const intervalId = setInterval(tick, SYLLABLE_TICK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [syllables, getTimeMs]);

  return sung !== null && sung.syllables === syllables ? sung : null;
}

/**
 * 발성 구간 동안 글자를 왼쪽부터 서서히 채우는 인라인 스타일.
 *
 * 틱(50ms)으로 진행률을 그리면 계단이 지므로, 시작만 틱으로 감지하고 채움 자체는
 * CSS 애니메이션에 맡긴다. 감지가 틱만큼 늦어도 음수 delay로 실제 시작 시각에 맞춰
 * 위치를 보정하므로, 리렌더로 애니메이션이 재시작돼도 이어 보인다 (linear라 가능).
 */
function fillStyle(syllable: SyllableTiming, sungTimeMs: number): CSSProperties {
  const durationMs = Math.max(syllable.endMs - syllable.startMs, 1);
  const elapsedMs = Math.max(sungTimeMs - syllable.startMs, 0);

  return {
    backgroundImage: 'linear-gradient(to right, var(--color-cyan-300, #67e8f9) 50%, #fff 50%)',
    backgroundSize: '200% 100%',
    backgroundPositionX: '100%',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    // clip: text는 배경이 칠해진 영역만 글자를 보여주는데, 인라인 배경 높이는 1순위
    // 폰트(Anybody, 라틴 전용) 메트릭을 따라서 폴백 폰트의 한글 윗부분이 잘린다.
    // 인라인 요소의 세로 padding은 레이아웃(줄 높이)에 영향 없이 칠 영역만 넓힌다.
    // 가로는 0이어야 한다 — 값을 주면 음절 사이가 벌어진다.
    padding: '0.2em 0',
    animation: `syllable-fill ${durationMs}ms linear ${-elapsedMs}ms forwards`,
  };
}

/**
 * 소절 단위 가사 표시. 지금 부를 소절을 크게 띄우고 다음 소절을 아래에 흐리게 둔다.
 * 배경 박스는 두지 않는다 — 무대의 캠 영상을 가리지 않도록 그림자만으로 가독성을 확보한다.
 *
 * midi.json이 음절 타이밍(syllable_highlights)을 주는 곡은 각 음절의 발성 구간
 * 동안 색이 차오른다. 없는 곡(LRCLIB 폴백)은 소절 단위로만 넘긴다 — LRC 타임스탬프로는
 * 음절 위치를 추측밖에 할 수 없고 어긋나면 오히려 부르기 어려워진다.
 *
 * 한글 가사라 대문자·이탤릭은 쓰지 않는다 (한글에서는 읽기만 나빠진다).
 */
export function LyricsOverlay({ currentLine, syllables, nextLine, getTimeMs }: LyricsOverlayProps) {
  const sung = useSungProgress(syllables, getTimeMs);

  return (
    <div className="absolute inset-x-0 bottom-10 flex flex-col items-center gap-2 px-6 text-center">
      {/*
        간주 구간에는 현재 소절이 비어 있다. 이때 요소를 빼면 아래 소절이 밀려 올라가
        가사가 출렁이므로, 자리는 그대로 두고 보이지만 않게 한다.
      */}
      <p
        className={cn(
          'text-3xl font-bold leading-tight text-white',
          SHADOW,
          !currentLine && 'invisible',
        )}
      >
        {syllables != null && syllables.length > 0
          ? syllables.map((syllable, index) => (
              // 발성이 끝난 음절도 같은 애니메이션의 마지막 프레임(forwards)으로 채워 둔다 —
              // 지속음이 겹칠 때도 각자 자기 속도로 차오르다 끝난 모습이 된다.
              <span
                key={index}
                style={sung !== null && index < sung.count ? fillStyle(syllable, sung.timeMs) : undefined}
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
