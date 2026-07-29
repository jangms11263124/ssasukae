interface LyricsOverlayProps {
  currentLine: string;
  nextLine?: string;
}

export function LyricsOverlay({ currentLine, nextLine }: LyricsOverlayProps) {
  return (
    <div className="absolute inset-x-0 bottom-10 px-6 text-center">
      <p className="text-3xl font-black uppercase italic tracking-tight text-cyan-200 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
        {currentLine}
      </p>
      {nextLine ? (
        <p className="mt-3 font-mono text-sm uppercase tracking-[0.22em] text-zinc-500">
          {nextLine}
        </p>
      ) : null}
    </div>
  );
}
