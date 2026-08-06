'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { buildRoomPath, getRoomSnapshot, leaveRoom } from '@/entities/room';
import { useAuth } from '@/entities/user';
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';
import { launchLowLatencyApp } from '@/shared/lib/launchLowLatencyApp';
import { showToast } from '@/shared/model/toastStore';
import { LowLatencyAppInstallDialog } from '@/shared/ui/dialog/LowLatencyAppInstallDialog';
import { AuthenticatedHeader } from '@/widgets/authenticated-header';

interface ChorusHandoffScreenProps {
  roomIdFromUrl: number | null;
}

interface ChorusRoom {
  name: string;
  inviteCode: string;
}

type LaunchState = 'loading' | 'launching' | 'opened' | 'unavailable';

/**
 * 합창(저지연) 방의 웹 화면. 오디오·연출은 전용 Rust 앱이 담당하므로 여기서는
 * 딥링크로 앱을 넘기고 설치 안내만 처리한다. 방 상태는 앱이 직접 구독한다.
 */
export function ChorusHandoffScreen({ roomIdFromUrl }: ChorusHandoffScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const launchedRoomIdRef = useRef<number | null>(null);
  const [room, setRoom] = useState<ChorusRoom | null>(null);
  const [launchState, setLaunchState] = useState<LaunchState>('loading');

  const launch = useCallback(
    (roomId: number, target: ChorusRoom) => {
      setLaunchState('launching');
      const requested = launchLowLatencyApp(roomId, {
        roomName: target.name,
        inviteCode: target.inviteCode,
        nickname: user?.nickname,
        onOpened: () => setLaunchState('opened'),
        onUnavailable: () => setLaunchState('unavailable'),
      });

      if (!requested) {
        setLaunchState('unavailable');
        showToast('로그인 정보를 확인한 뒤 다시 시도해 주세요.', 'error');
      }
    },
    [user?.nickname],
  );

  useEffect(() => {
    if (roomIdFromUrl === null) {
      showToast('방 정보가 없어요. 다시 들어와 주세요.', 'error');
      router.replace('/lobby');
      return;
    }

    let cancelled = false;

    getRoomSnapshot(roomIdFromUrl)
      .then((snapshot) => {
        if (cancelled) return;

        // 모드가 어긋난 URL로 들어온 경우 제 화면으로 돌려보낸다.
        if (snapshot.mode !== 'LOW_LATENCY') {
          router.replace(buildRoomPath(snapshot.mode, roomIdFromUrl));
          return;
        }

        setRoom({ name: snapshot.name, inviteCode: snapshot.inviteCode });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        showToast(getApiErrorMessage(error, '방 정보를 불러오지 못했어요.'), 'error');
        router.replace('/lobby');
      });

    return () => {
      cancelled = true;
    };
  }, [roomIdFromUrl, router]);

  // 방 정보를 확인한 뒤 한 번만 앱을 띄운다.
  useEffect(() => {
    if (roomIdFromUrl === null || room === null) return;
    if (launchedRoomIdRef.current === roomIdFromUrl) return;

    launchedRoomIdRef.current = roomIdFromUrl;
    launch(roomIdFromUrl, room);
  }, [launch, room, roomIdFromUrl]);

  const handleRelaunch = () => {
    if (roomIdFromUrl === null || room === null) return;
    launch(roomIdFromUrl, room);
  };

  const handleLeave = () => {
    if (roomIdFromUrl !== null) {
      void leaveRoom(roomIdFromUrl).catch(() => {});
    }
    router.replace('/lobby');
  };

  if (roomIdFromUrl === null || room === null) {
    return null;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#09090b] text-white">
      <AuthenticatedHeader />

      <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-6 py-16">
        <section className="w-full border border-cyan-300/25 bg-[linear-gradient(145deg,#1b1d20,#101113)] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-9">
          <p className="font-mono text-[10px] tracking-[0.28em] text-cyan-300">
            CHORUS ROOM / RUST_AUDIO_APP
          </p>

          <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">{room.name}</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            이 방은 영상과 브라우저 음성을 쓰지 않아요. 오디오는 전용 앱에서 연결해요.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3 border-y border-white/10 py-5">
            <span className="border border-fuchsia-400/40 bg-fuchsia-400/5 px-4 py-2 font-mono text-xs tracking-[0.16em] text-fuchsia-200">
              INVITE {room.inviteCode}
            </span>
            <span
              className={
                launchState === 'opened'
                  ? 'font-mono text-[11px] tracking-[0.14em] text-cyan-300'
                  : 'font-mono text-[11px] tracking-[0.14em] text-zinc-500'
              }
            >
              {launchState === 'opened' ? '● 앱으로 전환했어요' : '● 앱을 여는 중이에요'}
            </span>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleRelaunch}
              className="h-12 border border-cyan-300/60 bg-cyan-300/10 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/15"
            >
              전용 앱 다시 열기
            </button>
            <button
              type="button"
              onClick={handleLeave}
              className="h-12 border border-white/15 bg-white/[0.04] text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08]"
            >
              방 나가고 로비로 가기
            </button>
          </div>
        </section>
      </main>

      <LowLatencyAppInstallDialog
        open={launchState === 'unavailable'}
        onRetry={handleRelaunch}
        onClose={handleLeave}
        closeLabel="방 나가고 로비로 가기"
      />
    </div>
  );
}
