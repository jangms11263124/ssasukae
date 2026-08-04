interface ControlMessageProps {
  title: string;
  subtitle?: string;
}

/** 무대 진행 패널의 단계 안내 문구. 중앙 무대의 StageMessage를 패널 크기에 맞춘 버전 */
export function ControlMessage({ title, subtitle }: ControlMessageProps) {
  return (
    <div>
      <p className="text-sm leading-relaxed text-cyan-200">{title}</p>
      {subtitle ? <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{subtitle}</p> : null}
    </div>
  );
}
