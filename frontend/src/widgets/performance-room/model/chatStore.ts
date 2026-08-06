import { create } from 'zustand';

import { useRoomStore, type RoomParticipantChatPayload } from '@/entities/room';

export interface ChatMessage {
  /** 클라이언트 표시용 순번 (서버 payload에 식별자가 없다) */
  id: number;
  participantId: number;
  /** 수신 시점의 닉네임. 발신자가 이후 퇴장해도 지난 메시지 표기를 유지한다 */
  nickname: string;
  /** 수신 시점의 프로필 이미지. 닉네임과 같은 이유로 함께 붙잡아 둔다 */
  profileImageUrl: string | null;
  message: string;
  sendAt: string;
}

interface ChatStore {
  messages: ChatMessage[];
  appendMessage: (payload: RoomParticipantChatPayload) => void;
  resetChat: () => void;
}

let nextMessageId = 1;

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],

  appendMessage: (payload) =>
    set((state) => {
      const sender = useRoomStore
        .getState()
        .participants.find((participant) => participant.id === payload.participantId);

      return {
        messages: [
          ...state.messages,
          {
            id: nextMessageId++,
            participantId: payload.participantId,
            nickname: sender?.nickname ?? '알 수 없음',
            profileImageUrl: sender?.profileImageUrl ?? null,
            message: payload.message,
            sendAt: payload.sendAt,
          },
        ],
      };
    }),

  resetChat: () => set({ messages: [] }),
}));
