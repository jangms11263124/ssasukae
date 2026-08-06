'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getRoomSnapshot, useRoomStore } from '@/entities/room';
import { useAuth } from '@/entities/user';
import { ApiError } from '@/shared/api/client';
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';
import { showToast } from '@/shared/model/toastStore';

export type RoomBootstrapState = 'pending' | 'ready' | 'redirect';

/** Strict Mode 이중 실행 시 같은 roomId 복구 요청을 하나로 묶는다 */
const bootstrapTasks = new Map<number, Promise<void>>();

async function recoverRoomSession(
  roomId: number,
  user: { id: number; nickname: string; profileImageUrl: string | null },
): Promise<void> {
  const snapshot = await getRoomSnapshot(roomId);
  const me = snapshot.participants.find((participant) => participant.userId === user.id);

  if (me === undefined) {
    throw new ApiError('방 참가자 정보를 찾을 수 없어요.', 409);
  }

  const { enterRoom, hydrateFromSnapshot } = useRoomStore.getState();

  enterRoom({
    roomId,
    participantId: me.participantId,
    inviteCode: snapshot.inviteCode,
    name: snapshot.name,
    mode: snapshot.mode,
    isHost: me.host,
    // OpenVidu 토큰은 1회용이라 useOpenViduSession에서 새로 발급받는다.
    openViduSessionId: '',
    openViduToken: '',
    me: {
      userId: user.id,
      nickname: me.nickname,
      profileImageUrl: me.profileImageUrl,
    },
  });
  hydrateFromSnapshot(snapshot);
}

function runBootstrap(roomId: number, user: { id: number; nickname: string; profileImageUrl: string | null }) {
  const existing = bootstrapTasks.get(roomId);
  if (existing) {
    return existing;
  }

  const task = recoverRoomSession(roomId, user).finally(() => {
    bootstrapTasks.delete(roomId);
  });
  bootstrapTasks.set(roomId, task);
  return task;
}

/**
 * 새로고침·직접 URL 접근 시 URL의 roomId와 서버 스냅샷으로 roomStore 세션을 복구한다.
 */
export function useRoomBootstrap(roomIdFromUrl: number | null): RoomBootstrapState {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const session = useRoomStore((state) => state.session);
  const [bootstrapFailed, setBootstrapFailed] = useState(false);

  const needsBootstrap =
    session === null && !authLoading && user !== null && roomIdFromUrl !== null && !bootstrapFailed;

  useEffect(() => {
    if (!needsBootstrap || roomIdFromUrl === null || user === null) {
      return;
    }

    let cancelled = false;

    void runBootstrap(roomIdFromUrl, {
      id: user.id,
      nickname: user.nickname,
      profileImageUrl: user.profileImageUrl,
    }).catch((error: unknown) => {
      if (cancelled) {
        return;
      }

      showToast(getApiErrorMessage(error, '방 정보를 불러오지 못했어요.'), 'error');

      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
        useRoomStore.getState().leaveRoom();
      }

      setBootstrapFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [needsBootstrap, roomIdFromUrl, user]);

  useEffect(() => {
    if (session !== null || authLoading || user === null || roomIdFromUrl !== null) {
      return;
    }

    showToast('방 정보가 없어요. 다시 입장해 주세요.', 'error');
  }, [session, authLoading, user, roomIdFromUrl]);

  const shouldRedirect =
    session === null &&
    !authLoading &&
    (user === null || roomIdFromUrl === null || bootstrapFailed);

  useEffect(() => {
    if (!shouldRedirect) {
      return;
    }

    router.replace('/lobby');
  }, [shouldRedirect, router]);

  if (session !== null) {
    return 'ready';
  }

  if (authLoading || needsBootstrap) {
    return 'pending';
  }

  if (shouldRedirect) {
    return 'redirect';
  }

  return 'ready';
}
