import { useEffect, useState } from 'react';

/** 판독 자체가 불가능해 보이도록 블록·기호·숫자·한글 자모를 섞은 글리치 문자 풀 */
const GLYPHS = '█▓▒░▚▞▟▙◼#$%&@/\\<>+=~^?!;:10ㅋㅌㅑㅆㅄㅖ';

/** 첫 페인트용 고정 문자열 (서버 렌더와 일치해야 한다). 이후 틱마다 스크램블로 교체 */
const INITIAL_LINE = '█▓▒░▚ ▞▟█▓▒ ░▚▞▟ ██▓▒░';

const SCRAMBLE_INTERVAL_MS = 70;

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** 어절 수·길이까지 매번 달라지는 노이즈 한 줄 — 실제 가사의 길이도 유추할 수 없게 한다 */
function scrambleLine(): string {
  return Array.from({ length: randomInt(4, 6) }, () =>
    Array.from(
      { length: randomInt(2, 6) },
      () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    ).join(''),
  ).join(' ');
}

/**
 * LYRICS_HIDE 카드 효과 중 모든 참가자 화면에서 가사 대신 표시하는 차단 오버레이.
 * 해킹당한 방송처럼 보이도록 글자를 계속 스크램블하고, CSS(.lyrics-glitch)가
 * RGB 분리 레이어와 가로 조각 지터를 얹는다. 모션 감소 설정에서는 스크램블을 멈춘다.
 */
export function LyricsBlackout() {
  const [line, setLine] = useState(INITIAL_LINE);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const intervalId = setInterval(() => setLine(scrambleLine()), SCRAMBLE_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="absolute inset-x-0 bottom-10 px-6 text-center">
      <p className="sr-only" aria-live="polite">
        가사가 가려졌습니다
      </p>
      <p
        aria-hidden
        data-text={line}
        className="lyrics-glitch text-3xl font-black tracking-tight text-zinc-300"
      >
        {line}
      </p>
      <p className="lyrics-glitch-label mt-3 font-mono text-sm uppercase tracking-[0.22em] text-red-400">
        ⚠ SIGNAL HIJACKED — LYRICS BLACKOUT
      </p>
    </div>
  );
}
