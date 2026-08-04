interface LyricsNoticeProps {
  message: string;
}

/**
 * 가사를 불러오는 중이거나 싱크 가사를 찾지 못했을 때 가사 자리에 대신 놓는 안내.
 * 가사 오버레이와 같은 위치를 써서 무대 레이아웃이 흔들리지 않게 한다.
 */
export function LyricsNotice({ message }: LyricsNoticeProps) {
  return (
    <div className="absolute inset-x-0 bottom-10 px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-zinc-500 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
        {message}
      </p>
    </div>
  );
}
