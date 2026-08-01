import type { ReactNode } from 'react';

interface MediaIconProps {
  className?: string;
}

interface MediaIconFrameProps extends MediaIconProps {
  children: ReactNode;
}

// 선 두께·라인캡이 어긋나면 토글을 나란히 놓았을 때 티가 나므로 한곳에서 관리한다.
function MediaIconFrame({ className = 'size-3.5', children }: MediaIconFrameProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export function MicIcon({ className }: MediaIconProps) {
  return (
    <MediaIconFrame className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </MediaIconFrame>
  );
}

export function CamIcon({ className }: MediaIconProps) {
  return (
    <MediaIconFrame className={className}>
      <rect x="3" y="7" width="12" height="10" rx="1.5" />
      <path d="m15 11 6-3v8l-6-3" />
    </MediaIconFrame>
  );
}

// 우측 AUDIO ENGINE 패널 아이콘과 같은 페이더 모양으로 맞춘다.
export function SoundIcon({ className }: MediaIconProps) {
  return (
    <MediaIconFrame className={className}>
      <path d="M6 4v16M12 4v16M18 4v16" />
      <path d="M4.5 9h3M10.5 14h3M16.5 7h3" />
    </MediaIconFrame>
  );
}

export function GestureIcon({ className }: MediaIconProps) {
  return (
    <MediaIconFrame className={className}>
      <path d="M9 10V5.5a1.5 1.5 0 0 1 3 0V10" />
      <path d="M12 10V4.5a1.5 1.5 0 0 1 3 0V10" />
      <path d="M15 10V6.5a1.5 1.5 0 0 1 3 0V13" />
      <path d="M9 10V9.5a1.5 1.5 0 0 0-3 0V15a6 6 0 0 0 6 6h1a5 5 0 0 0 5-5v-3" />
    </MediaIconFrame>
  );
}