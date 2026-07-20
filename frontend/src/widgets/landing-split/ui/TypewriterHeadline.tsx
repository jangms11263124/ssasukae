'use client';

import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/shared/lib/cn';

interface TypewriterHeadlineProps {
  lineBefore: string;
  lineAccent: string;
  className?: string;
  typingMs?: number;
  deletingMs?: number;
  pauseMs?: number;
}

function TypewriterCursor() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block w-[2px] animate-pulse bg-fuchsia-300 align-middle"
      style={{ height: '0.85em' }}
    />
  );
}

export function TypewriterHeadline({
  lineBefore,
  lineAccent,
  className,
  typingMs = 90,
  deletingMs = 55,
  pauseMs = 2200,
}: TypewriterHeadlineProps) {
  const fullText = useMemo(() => `${lineBefore}\n${lineAccent}`, [lineAccent, lineBefore]);
  const [length, setLength] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setPrefersReducedMotion(media.matches);

    syncPreference();
    media.addEventListener('change', syncPreference);

    return () => media.removeEventListener('change', syncPreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setLength(fullText.length);
      setIsDeleting(false);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;

    if (!isDeleting && length < fullText.length) {
      timeoutId = setTimeout(() => setLength((current) => current + 1), typingMs);
    } else if (!isDeleting && length === fullText.length) {
      timeoutId = setTimeout(() => setIsDeleting(true), pauseMs);
    } else if (isDeleting && length > 0) {
      timeoutId = setTimeout(() => setLength((current) => current - 1), deletingMs);
    } else {
      timeoutId = setTimeout(() => setIsDeleting(false), 400);
    }

    return () => clearTimeout(timeoutId);
  }, [deletingMs, fullText.length, isDeleting, length, pauseMs, prefersReducedMotion, typingMs]);

  const displayed = fullText.slice(0, length);
  const newlineIndex = displayed.indexOf('\n');
  const isOnSecondLine = newlineIndex !== -1;
  const line1 = isOnSecondLine ? displayed.slice(0, newlineIndex) : displayed;
  const line2 = isOnSecondLine ? displayed.slice(newlineIndex + 1) : '';
  const showCursor = !prefersReducedMotion;

  return (
    <h1
      className={cn(
        'mx-auto w-fit max-w-full font-bold leading-[1.12] tracking-tight text-white',
        'text-[1.875rem] sm:text-[2.125rem] lg:mx-0 lg:text-[clamp(1.75rem,3.6vw,3.75rem)]',
        className,
      )}
    >
      <span className="block min-h-[1.12em] whitespace-nowrap">
        {line1}
        {showCursor && !isOnSecondLine && <TypewriterCursor />}
      </span>
      <span className="block min-h-[1.12em] whitespace-nowrap text-fuchsia-300">
        {line2}
        {showCursor && isOnSecondLine && <TypewriterCursor />}
      </span>
    </h1>
  );
}
