export type RoomMode = 'GENERAL' | 'BATTLE' | 'LOW_LATENCY';

export interface RoomSummary {
  id: number;
  inviteCode: string;
  maxParticipants: number;
  mode: RoomMode;
  name: string;
}
