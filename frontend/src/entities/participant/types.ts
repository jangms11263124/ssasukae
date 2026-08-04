export type ParticipantConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'LEFT' | 'KICKED';
export type ParticipantStageRole = 'PERFORMER' | 'PARTICIPANT';

export interface RoomParticipant {
  connectionStatus: ParticipantConnectionStatus;
  id: number;
  nickname: string;
  /** http(s) 공개 URL. 없으면 플레이스홀더를 쓴다 */
  profileImageUrl: string | null;
  stageRole: ParticipantStageRole;
  userId: number;
}
