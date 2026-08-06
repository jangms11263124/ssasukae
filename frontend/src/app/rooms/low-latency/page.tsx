import { parseRoomIdParam } from '@/entities/room';
import { ChorusHandoffScreen } from '@/widgets/chorus-handoff';

interface LowLatencyRoomPageProps {
  searchParams: Promise<{ roomId?: string | string[] }>;
}

// 페이지는 서버 컴포넌트로 두고 쿼리는 prop으로 받는다 — useSearchParams를 쓰면
// 페이지 전체가 클라이언트로 내려가고 Suspense 경계까지 필요해진다.
export default async function LowLatencyRoomPage({ searchParams }: LowLatencyRoomPageProps) {
  const { roomId } = await searchParams;

  return <ChorusHandoffScreen roomIdFromUrl={parseRoomIdParam(roomId)} />;
}
