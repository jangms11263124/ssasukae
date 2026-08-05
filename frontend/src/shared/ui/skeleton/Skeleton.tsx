import { cn } from '@/shared/lib/cn';

/**
 * 블록의 밝기. 실제 콘텐츠의 시각적 무게(제목 > 본문 > 보조 텍스트·썸네일)에 맞춰 고른다.
 * 면적이 큰 자리(패널 한 칸 등)는 같은 밝기라도 무겁게 보이므로 dim을 쓴다.
 */
type SkeletonTone = 'dim' | 'faint' | 'base' | 'strong';

// cn은 tailwind-merge가 아니라 clsx라서 className으로 배경색을 덮을 수 없다. 톤은 프리셋으로 받는다.
const TONE_CLASS: Record<SkeletonTone, string> = {
  dim: 'bg-white/[0.02]',
  faint: 'bg-white/[0.04]',
  base: 'bg-white/[0.05]',
  strong: 'bg-white/[0.06]',
};

interface SkeletonProps {
  /** 크기·여백은 실제 콘텐츠와 같아야 하므로 호출 측에서 지정한다. */
  className?: string;
  tone?: SkeletonTone;
}

/** 로딩 중 실제 콘텐츠 자리를 지키는 회색 블록. */
export function Skeleton({ className, tone = 'base' }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('animate-pulse', TONE_CLASS[tone], className)} />;
}
