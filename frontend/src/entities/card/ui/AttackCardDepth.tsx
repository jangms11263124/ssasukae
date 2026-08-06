'use client';

import type { ReactNode } from 'react';

import './attack-card-depth.css';

interface AttackCardDepthProps {
  children: ReactNode;
  /** 뒷판 표시 (앞면만 있을 때 두께가 보이도록) */
  showBackplate?: boolean;
}

/** 카드 4면 엣지 + 코어로 실물 두께감을 만든다. */
export function AttackCardDepth({ children, showBackplate = true }: AttackCardDepthProps) {
  return (
    <div className="attack-card-depth">
      <span className="attack-card-depth__core" aria-hidden />
      {showBackplate ? <span className="attack-card-depth__backplate" aria-hidden /> : null}
      <span className="attack-card-depth__edge attack-card-depth__edge--left" aria-hidden />
      <span className="attack-card-depth__edge attack-card-depth__edge--right" aria-hidden />
      <span className="attack-card-depth__edge attack-card-depth__edge--top" aria-hidden />
      <span className="attack-card-depth__edge attack-card-depth__edge--bottom" aria-hidden />
      <div className="attack-card-depth__face">{children}</div>
    </div>
  );
}
