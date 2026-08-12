interface ControlMessageProps {
  title: string;
  subtitle?: string;
}

/** 현재 곡 바의 단계 안내 문구. 한 줄 제목 + 작은 부연으로 바 높이에 맞춘다 */
export function ControlMessage({ title, subtitle }: ControlMessageProps) {
  return (
    <div className="min-w-0">
      <p className="break-keep text-xs leading-relaxed text-cyan-200">{title}</p>
      {subtitle ? (
        <p className="mt-0.5 break-keep text-[11px] leading-relaxed text-zinc-500">{subtitle}</p>
      ) : null}
    </div>
  );
}
