'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PointerPosition {
  x: number;
  y: number;
}

const INITIAL_POINTER: PointerPosition = { x: 0.5, y: 0.5 };

export function usePointerPosition<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [position, setPosition] = useState<PointerPosition>(INITIAL_POINTER);
  const [isActive, setIsActive] = useState(false);

  const updatePosition = useCallback((clientX: number, clientY: number) => {
    const element = ref.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    setPosition({
      x: Math.min(Math.max(x, 0), 1),
      y: Math.min(Math.max(y, 0), 1),
    });
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<T>) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }

      updatePosition(event.clientX, event.clientY);
      setIsActive(true);
    },
    [updatePosition],
  );

  const handlePointerLeave = useCallback(() => {
    setIsActive(false);
    setPosition(INITIAL_POINTER);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handlePreferenceChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsActive(false);
      }
    };

    media.addEventListener('change', handlePreferenceChange);

    return () => {
      media.removeEventListener('change', handlePreferenceChange);
    };
  }, []);

  return {
    ref,
    position,
    isActive,
    handlePointerMove,
    handlePointerLeave,
  };
}
