import type { RoomParticipant } from '@/entities/participant';

function PersonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="size-10 text-zinc-600"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="9.5" r="3" />
      <path d="M6.6 18.3c1.2-2.3 3.2-3.5 5.4-3.5s4.2 1.2 5.4 3.5" />
    </svg>
  );
}

// WebRTC 스트림이 연결되기 전까지 아바타 아이콘을 보여주는 캠 타일.
// 타일 폭은 항상 3열 기준(1/3)으로 고정해 참가자 수가 줄어도 비율이 유지된다.
function ParticipantVideoTile({ participant }: { participant: RoomParticipant }) {
  return (
    <div className="flex w-[calc((100%-2rem)/3)] min-w-0 flex-col border border-white/10 bg-[#1c1c1f] p-2">
      <div className="grid aspect-video place-items-center border border-white/5 bg-[#242428]">
        <PersonIcon />
      </div>
      <p className="truncate pt-1.5 text-xs text-zinc-300">{participant.nickname}</p>
    </div>
  );
}

interface ParticipantVideoGridProps {
  currentUserId: number;
  participants: RoomParticipant[];
}

export function ParticipantVideoGrid({ currentUserId, participants }: ParticipantVideoGridProps) {
  const others = participants.filter(({ userId }) => userId !== currentUserId);

  return (
    <div className="flex justify-center gap-4" aria-label="참가자 캠 화면">
      {others.map((participant) => (
        <ParticipantVideoTile key={participant.id} participant={participant} />
      ))}
    </div>
  );
}
