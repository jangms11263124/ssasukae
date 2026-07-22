'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useLogoutMutation } from '@/features/auth-logout/api/useLogoutMutation';
import { useAuthStore } from '@/shared/model/authStore';

import { refreshAccessToken } from '../api/authApi';
import { userQueryKeys } from '../api/queryKeys';
import { useUserQuery } from '../api/useUserQuery';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithAccessToken: (accessToken: string, user?: User) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const logoutMutation = useLogoutMutation();
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const accessToken = useAuthStore((state) => state.accessToken);
  const setAccessToken = useAuthStore((state) => state.setAccessToken);
  const clearAccessToken = useAuthStore((state) => state.clearAccessToken);
  const hasSession = Boolean(accessToken);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapAuth() {
      if (useAuthStore.getState().accessToken) {
        if (!cancelled) {
          setIsBootstrapped(true);
        }
        return;
      }

      // OAuth 콜백 URL의 accessToken 처리와 refresh 레이스 방지
      if (
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).has('accessToken')
      ) {
        if (!cancelled) {
          setIsBootstrapped(true);
        }
        return;
      }

      try {
        const refreshed = await refreshAccessToken();
        if (!cancelled) {
          setAccessToken(refreshed.accessToken);
        }
      } catch {
        if (!cancelled && !useAuthStore.getState().accessToken) {
          clearAccessToken();
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapped(true);
        }
      }
    }

    void bootstrapAuth();

    return () => {
      cancelled = true;
    };
  }, [clearAccessToken, setAccessToken]);

  const userQuery = useUserQuery(isBootstrapped && hasSession);

  useEffect(() => {
    if (!userQuery.isError) {
      return;
    }

    clearAccessToken();
    queryClient.removeQueries({ queryKey: userQueryKeys.all });
  }, [clearAccessToken, queryClient, userQuery.isError]);

  const loginWithAccessToken = useCallback(
    async (accessToken: string, authenticatedUser?: User) => {
      setAccessToken(accessToken);

      if (authenticatedUser) {
        queryClient.setQueryData(userQueryKeys.me(), authenticatedUser);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: userQueryKeys.me() });
    },
    [queryClient, setAccessToken],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const isLoading = !isBootstrapped || (hasSession && userQuery.isLoading);
  const user = userQuery.data ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: hasSession && user !== null,
      isLoading,
      loginWithAccessToken,
      logout,
    }),
    [user, hasSession, isLoading, loginWithAccessToken, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
