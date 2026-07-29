export type ParticipantConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'LEFT' | 'KICKED';
export type ParticipantStageRole = 'PERFORMER' | 'PARTICIPANT';

export interface RoomParticipant {
  connectionStatus: ParticipantConnectionStatus;
  id: number;
  nickname: string;
  stageRole: ParticipantStageRole;
  userId: number;
}
