import { create } from 'zustand';

/**
 * PING-PONG 왕복 지연(ms) 전용 스토어. 아직 PONG을 받지 못했으면 null.
 *
 * 소켓 API 객체(useRoomSocket 반환값)에 실으면 10초마다 지연값이 갱신될 때마다
 * 컨텍스트 컨슈머 전체가 재렌더된다 — 푸터의 표시 컴포넌트만 구독하도록 분리한다.
 */
interface LatencyState {
  latencyMs: number | null;
  setLatencyMs: (latencyMs: number | null) => void;
}

export const useLatencyStore = create<LatencyState>((set) => ({
  latencyMs: null,
  setLatencyMs: (latencyMs) => set({ latencyMs }),
}));
