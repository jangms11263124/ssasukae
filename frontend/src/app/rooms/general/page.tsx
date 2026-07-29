import { GeneralRoomScreen } from '@/widgets/performance-room';

export default function GeneralRoomPage() {
  // 방 세션(roomId, 참가자, 토큰)은 방 생성/입장 시 roomStore에 저장된다.
  // URL의 ?roomId= 쿼리는 공유·디버깅용 표시일 뿐 세션 복구에는 쓰이지 않는다.
  return <GeneralRoomScreen />;
}
