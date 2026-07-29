export type RoomMode = 'GENERAL' | 'BATTLE';

export interface RoomSummary {
  id: number;
  inviteCode: string;
  maxParticipants: number;
  mode: RoomMode;
  name: string;
}
