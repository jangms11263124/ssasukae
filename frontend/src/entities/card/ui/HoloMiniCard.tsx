import { cn } from '@/shared/lib/cn';

import { StarCubeIcon } from './CardIcons';

interface HoloMiniCardProps {
  className?: string;
  /** true면 사용 완료 상태(회색 탈색) */
  used?: boolean;
}

/**
 * 참가자 캠 하단에 표시하는 카드 보유 상태 미니 카드.
 * 미사용은 무지개 홀로그램, 사용 완료는 회색으로 표시한다.
 */
export function HoloMiniCard({ className, used = false }: HoloMiniCardProps) {
  return (
    <div
      className={cn(
        'relative aspect-[63/88] w-10 select-none overflow-hidden border',
        used ? 'border-zinc-600' : 'animate-holo-shift border-cyan-300',
        className,
      )}
      style={{
        background: used
          ? 'linear-gradient(135deg, #3f3f46 0%, #27272a 50%, #3f3f46 100%)'
          : 'linear-gradient(115deg, #f87171 0%, #a855f7 22%, #facc15 45%, #4ade80 68%, #22d3ee 85%, #f87171 100%)',
        backgroundSize: '250% 250%',
        boxShadow: used ? 'none' : '0 0 10px rgb(34 211 238 / 45%)',
      }}
    >
      <div className="grid size-full place-items-center">
        <StarCubeIcon className={cn('size-4', used ? 'text-zinc-500' : 'text-black/70')} />
      </div>
    </div>
  );
}
