'use client';

import { useEffect, useRef } from 'react';

export function PointerGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow) return;

    let animationFrameId: number | null = null;
    let pointerX = 0;
    let pointerY = 0;
    let isGlowVisible = false;

    const setGlowVisibility = (isVisible: boolean) => {
      if (isGlowVisible === isVisible) return;
      isGlowVisible = isVisible;
      glow.dataset.visible = String(isVisible);
    };

    const renderPosition = () => {
      glow.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0)`;
      setGlowVisibility(true);
      animationFrameId = null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      animationFrameId ??= window.requestAnimationFrame(renderPosition);
    };

    const hideGlow = () => {
      setGlowVisibility(false);
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (event.relatedTarget === null) hideGlow();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerout', handlePointerOut, { passive: true });
    window.addEventListener('blur', hideGlow);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerout', handlePointerOut);
      window.removeEventListener('blur', hideGlow);
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <div ref={glowRef} aria-hidden="true" data-visible="false" className="pointer-glow" />;
}
