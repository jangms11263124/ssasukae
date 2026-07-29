'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { RoomSocketApi } from './useRoomSocket';

const noop = () => undefined;

const FALLBACK_SOCKET: RoomSocketApi = {
  isConnected: false,
  latencyMs: null,
  sendPing: noop,
  sendPrepare: noop,
  sendPlaybackStart: noop,
  sendPlaybackFinish: noop,
  sendSettings: noop,
  sendCancel: noop,
};

const RoomSocketContext = createContext<RoomSocketApi>(FALLBACK_SOCKET);

interface RoomSocketProviderProps {
  children: ReactNode;
  value: RoomSocketApi;
}

export function RoomSocketProvider({ children, value }: RoomSocketProviderProps) {
  return <RoomSocketContext.Provider value={value}>{children}</RoomSocketContext.Provider>;
}

export function useRoomSocketContext(): RoomSocketApi {
  return useContext(RoomSocketContext);
}
