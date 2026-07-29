interface LeaveRoomButtonProps {
  onLeaveRoom: () => void;
}

export function LeaveRoomButton({ onLeaveRoom }: LeaveRoomButtonProps) {
  return (
    <button
      type="button"
      onClick={onLeaveRoom}
      className="min-h-9 w-full border border-red-500/40 bg-red-950/15 px-4 font-mono text-[10px] tracking-[0.12em] text-red-400 transition-colors hover:border-red-400/70 hover:bg-red-950/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
    >
      DISCONNECT ROOM
    </button>
  );
}
