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
  /** 플로팅 채팅 패널 열림 여부. 열려 있는 동안 온 메시지는 읽은 것으로 본다 */
  isPanelOpen: boolean;
  /** 패널이 닫혀 있는 동안 쌓인 메시지 수. 플로팅 버튼의 빨간 점이 읽는다 */
  unreadCount: number;
  appendMessage: (payload: RoomParticipantChatPayload) => void;
  openPanel: () => void;
  closePanel: () => void;
  resetChat: () => void;
}

let nextMessageId = 1;

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isPanelOpen: false,
  unreadCount: 0,

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
        unreadCount: state.isPanelOpen ? state.unreadCount : state.unreadCount + 1,
      };
    }),

  // 패널을 열면 지금까지 온 메시지를 모두 읽은 것으로 친다.
  openPanel: () => set({ isPanelOpen: true, unreadCount: 0 }),
  closePanel: () => set({ isPanelOpen: false }),

  resetChat: () => set({ messages: [], isPanelOpen: false, unreadCount: 0 }),
}));
