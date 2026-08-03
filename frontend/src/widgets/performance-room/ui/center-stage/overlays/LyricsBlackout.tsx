/** LYRICS_HIDE 카드 효과 중 가창자 화면에서 가사 대신 표시하는 차단 오버레이 */
export function LyricsBlackout() {
  return (
    <div className="absolute inset-x-0 bottom-10 px-6 text-center" aria-live="polite">
      <p
        className="text-3xl font-black uppercase italic tracking-tight text-zinc-600"
        aria-label="가사가 가려졌습니다"
      >
        ████ ▓▓▒▒░░ ████▓ ▒▒░ ███
      </p>
      <p className="mt-3 font-mono text-sm uppercase tracking-[0.22em] text-red-400">
        LYRICS BLACKOUT
      </p>
    </div>
  );
}
