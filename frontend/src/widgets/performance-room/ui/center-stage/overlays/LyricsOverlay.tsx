import { cn } from '@/shared/lib/cn';

interface LyricsOverlayProps {
  currentLine: string;
  nextLine?: string;
}

const SHADOW = 'drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]';

/**
 * 소절 단위 가사 표시. 지금 부를 소절을 박스로 강조하고 다음 소절을 아래에 흐리게 둔다.
 *
 * 음절별 진행 표시(글자가 차오르는 효과)는 하지 않는다 — LRCLIB이 주는 타임스탬프는
 * 소절 단위라서, 음절 위치는 추측밖에 할 수 없고 어긋나면 오히려 부르기 어려워진다.
 *
 * 한글 가사라 대문자·이탤릭은 쓰지 않는다 (한글에서는 읽기만 나빠진다).
 */
export function LyricsOverlay({ currentLine, nextLine }: LyricsOverlayProps) {
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
        {currentLine || ' '}
      </p>
      <p className={cn('text-2xl font-bold leading-tight text-zinc-400/80', SHADOW)}>
        {nextLine || ' '}
      </p>
    </div>
  );
}
