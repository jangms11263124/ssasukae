interface LyricsCountdownProps {
  /** 다음 소절까지 남은 초 (3·2·1) */
  seconds: number;
}

/**
 * 노래방 기계처럼, 인트로와 간주가 끝나고 다음 소절이 시작되기 직전에 세는 3·2·1.
 *
 * 재생 자체를 미루지 않는다 — 서버가 PLAYBACK_STARTED부터 재생 위치를 재고 있어서
 * 시작을 늦추면 재접속 복구 위치가 어긋난다. 가사 시간축만 보고 세므로 가창자와 참가자가
 * 같은 시점에 같은 숫자를 본다.
 */
export function LyricsCountdown({ seconds }: LyricsCountdownProps) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-36 flex flex-col items-center gap-3"
      aria-live="off"
    >
      <p className="font-mono text-[10px] tracking-[0.32em] text-cyan-300/80 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
        READY
      </p>

      {/* 숫자마다 요소를 갈아 끼워 매 초 애니메이션이 다시 돈다 */}
      <p
        key={seconds}
        className="text-7xl font-black italic leading-none text-cyan-300 drop-shadow-[0_0_24px_rgba(34,211,238,0.55)] [animation:countdown-pop_1s_ease-out_both]"
      >
        {seconds}
      </p>

      <div className="flex gap-2" aria-hidden="true">
        {[3, 2, 1].map((step) => (
          <span
            key={step}
            className={
              step <= seconds
                ? 'size-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                : 'size-1.5 rounded-full bg-white/20'
            }
          />
        ))}
      </div>
    </div>
  );
}
