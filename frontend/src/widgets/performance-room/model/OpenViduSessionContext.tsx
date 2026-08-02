'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { OpenViduSessionApi } from './useOpenViduSession';

// Provider 밖(스토리북·테스트 등)에서도 안전하게 동작하도록 빈 세션을 기본값으로 둔다.
const FALLBACK_SESSION: OpenViduSessionApi = {
  isConnected: false,
  localStream: null,
  remoteStreams: new Map(),
};

const OpenViduSessionContext = createContext<OpenViduSessionApi>(FALLBACK_SESSION);

interface OpenViduSessionProviderProps {
  children: ReactNode;
  value: OpenViduSessionApi;
}

export function OpenViduSessionProvider({ children, value }: OpenViduSessionProviderProps) {
  return <OpenViduSessionContext.Provider value={value}>{children}</OpenViduSessionContext.Provider>;
}

export function useOpenViduSessionContext(): OpenViduSessionApi {
  return useContext(OpenViduSessionContext);
}
