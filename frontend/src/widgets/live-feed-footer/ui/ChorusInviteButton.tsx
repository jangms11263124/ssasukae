'use client';

import { useState } from 'react';

import { cn } from '@/shared/lib/cn';

import { LIVE_FEED_COPY } from '../config/liveFeedCopy';
import { ChorusLaunchDialog } from './ChorusLaunchDialog';

interface ChorusInviteButtonProps {
  className?: string;
}

export function ChorusInviteButton({ className }: ChorusInviteButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsDialogOpen(true)}
        className={cn(
          'shrink-0 whitespace-nowrap border border-neon-cyan/40 bg-neon-cyan/[0.08] px-3 py-1 font-bold tracking-[0.08em] text-neon-cyan transition-colors hover:border-neon-cyan hover:bg-neon-cyan/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan',
          className,
        )}
      >
        {LIVE_FEED_COPY.chorusCta}
      </button>

      {isDialogOpen && <ChorusLaunchDialog onClose={() => setIsDialogOpen(false)} />}
    </>
  );
}
