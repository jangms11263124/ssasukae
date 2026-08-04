'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { PerformanceRoomScreen } from '@/widgets/performance-room';

function parseRoomId(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function BattleRoomPageContent() {
  const searchParams = useSearchParams();
  const roomIdFromUrl = parseRoomId(searchParams.get('roomId'));

  return <PerformanceRoomScreen roomIdFromUrl={roomIdFromUrl} />;
}

export default function BattleRoomPage() {
  return (
    <Suspense fallback={null}>
      <BattleRoomPageContent />
    </Suspense>
  );
}
