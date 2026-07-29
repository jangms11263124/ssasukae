import { create } from 'zustand';

import type { RoomParticipant } from '@/entities/participant';

import type { RoomSnapshotResponse } from '../api/roomApi';
import type { RoomMode } from '../types';
import type {
  ParticipantConnectionStatusChangedPayload,
  ParticipantJoinedPayload,
  ParticipantKickedPayload,
  ParticipantLeftPayload,
  RoomHostChangedPayload,
} from './wsEvents';

export interface RoomSession {
  roomId: number;
  myParticipantId: number;
  inviteCode: string;
  name: string;
  mode: RoomMode;
  maxParticipants: number;
  isHost: boolean;
  openViduSessionId: string;
  openViduToken: string;
}

interface EnterRoomInput {
  roomId: number;
  participantId: number;
  inviteCode: string;
  name: string;
  mode: RoomMode;
  isHost: boolean;
  openViduSessionId: string;
  openViduToken: string;
  /** 방에 들어간 본인 정보 (참가자 목록의 첫 항목이 된다) */
  me: { userId: number; nickname: string };
}

interface RoomStore {
  session: RoomSession | null;
  participants: RoomParticipant[];
  hostParticipantId: number | null;

  enterRoom: (input: EnterRoomInput) => void;
  leaveRoom: () => void;
  setOpenViduToken: (token: string) => void;
  /** 방 정보 조회 응답으로 방 메타·참가자 목록·방장 정보를 서버 기준으로 덮어쓴다 */
  hydrateFromSnapshot: (snapshot: RoomSnapshotResponse) => void;

  // ── WebSocket 이벤트 반영 ──
  applyParticipantJoined: (payload: ParticipantJoinedPayload) => void;
  applyParticipantLeft: (payload: ParticipantLeftPayload) => void;
  applyParticipantKicked: (payload: ParticipantKickedPayload) => void;
  applyHostChanged: (payload: RoomHostChangedPayload) => void;
  applyConnectionStatusChanged: (payload: ParticipantConnectionStatusChangedPayload) => void;
}

const ROOM_MAX_PARTICIPANTS = 4;

export const useRoomStore = create<RoomStore>((set) => ({
  session: null,
  participants: [],
  hostParticipantId: null,

  enterRoom: ({ me, participantId, isHost, ...rest }) =>
    set({
      session: {
        ...rest,
        myParticipantId: participantId,
        isHost,
        maxParticipants: ROOM_MAX_PARTICIPANTS,
      },
      participants: [
        {
          connectionStatus: 'CONNECTED',
          id: participantId,
          nickname: me.nickname,
          stageRole: 'PARTICIPANT',
          userId: me.userId,
        },
      ],
      // 입장 응답에는 방장 participantId가 없어 내가 방장일 때만 채운다.
      // 입장 직후 방 정보 조회(hydrateFromSnapshot)가 서버 기준으로 덮어쓴다.
      hostParticipantId: isHost ? participantId : null,
    }),

  leaveRoom: () => set({ session: null, participants: [], hostParticipantId: null }),

  setOpenViduToken: (token) =>
    set((state) =>
      state.session ? { session: { ...state.session, openViduToken: token } } : state,
    ),

  hydrateFromSnapshot: (snapshot) =>
    set((state) => {
      if (state.session === null) {
        return state;
      }

      const host = snapshot.participants.find((participant) => participant.host) ?? null;

      return {
        session: {
          ...state.session,
          name: snapshot.name,
          mode: snapshot.mode,
          maxParticipants: snapshot.maxParticipants,
          isHost: host !== null && host.participantId === state.session.myParticipantId,
        },
        participants: snapshot.participants.map((participant) => ({
          connectionStatus: participant.connectionStatus,
          id: participant.participantId,
          nickname: participant.nickname,
          stageRole: participant.stageRole,
          userId: participant.userId,
        })),
        hostParticipantId: host?.participantId ?? null,
      };
    }),

  applyParticipantJoined: (payload) =>
    set((state) => {
      if (state.participants.some((p) => p.id === payload.participantId)) {
        return state;
      }

      return {
        participants: [
          ...state.participants,
          {
            connectionStatus: 'CONNECTED',
            id: payload.participantId,
            nickname: payload.nickname,
            stageRole: 'PARTICIPANT',
            userId: payload.userId,
          },
        ],
      };
    }),

  applyParticipantLeft: (payload) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.id !== payload.participantId),
    })),

  applyParticipantKicked: (payload) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.id !== payload.participantId),
    })),

  applyHostChanged: (payload) =>
    set((state) => ({
      hostParticipantId: payload.newHostParticipantId,
      session:
        state.session === null
          ? null
          : {
              ...state.session,
              isHost: state.session.myParticipantId === payload.newHostParticipantId,
            },
    })),

  applyConnectionStatusChanged: (payload) =>
    set((state) => ({
      participants: state.participants.map((p) =>
        p.id === payload.participantId ? { ...p, connectionStatus: payload.status } : p,
      ),
    })),
}));
