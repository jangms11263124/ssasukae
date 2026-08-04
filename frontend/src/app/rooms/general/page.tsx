'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { GeneralRoomScreen } from '@/widgets/performance-room';

function parseRoomId(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function GeneralRoomPageContent() {
  const searchParams = useSearchParams();
  const roomIdFromUrl = parseRoomId(searchParams.get('roomId'));

  return <GeneralRoomScreen roomIdFromUrl={roomIdFromUrl} />;
}

export default function GeneralRoomPage() {
  return (
    <Suspense fallback={null}>
      <GeneralRoomPageContent />
    </Suspense>
  );
}
