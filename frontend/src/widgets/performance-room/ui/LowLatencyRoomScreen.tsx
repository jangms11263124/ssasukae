'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getRoomSnapshot, useRoomStore } from '@/entities/room';
import { ApiError } from '@/shared/api/client';
import { launchLowLatencyApp } from '@/shared/lib/launchLowLatencyApp';
import { useAuthStore } from '@/shared/model/authStore';
import { showToast } from '@/shared/model/toastStore';
import { AuthenticatedHeader } from '@/widgets/authenticated-header';

import { useRoomSocket } from '../model/useRoomSocket';

export function LowLatencyRoomScreen() {
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);
  const session = useRoomStore((state) => state.session);
  const participants = useRoomStore((state) => state.participants);
  const hydrateFromSnapshot = useRoomStore((state) => state.hydrateFromSnapshot);
  const launchedRoomIdRef = useRef<number | null>(null);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const roomId = session?.mode === 'LOW_LATENCY' ? session.roomId : null;
  const socket = useRoomSocket(roomId);

  useEffect(() => {
    if (roomId === null) {
      showToast('고급 모드 방 정보가 없습니다. 다시 입장해 주세요.', 'error');
      router.replace('/lobby');
      return;
    }

    let cancelled = false;
    getRoomSnapshot(roomId)
      .then((snapshot) => {
        if (!cancelled) hydrateFromSnapshot(snapshot);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof ApiError ? error.message : '방 정보를 불러오지 못했습니다.';
        showToast(message, 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [hydrateFromSnapshot, roomId, router]);

  useEffect(() => {
    if (roomId === null || !accessToken || launchedRoomIdRef.current === roomId) return;
    if (
      launchLowLatencyApp(roomId, {
        onUnavailable: () => setIsInstallModalOpen(true),
      })
    ) {
      launchedRoomIdRef.current = roomId;
    }
  }, [accessToken, roomId]);

  const reopenAudioApp = () => {
    if (roomId === null) {
      showToast('방 정보를 확인할 수 없습니다. 웹에서 다시 입장해주세요.', 'error');
      return;
    }

    setIsInstallModalOpen(false);
    if (
      !launchLowLatencyApp(roomId, {
        onUnavailable: () => setIsInstallModalOpen(true),
      })
    ) {
      showToast('로그인 정보를 확인한 뒤 다시 시도해주세요.', 'error');
    }
  };

  if (session === null || roomId === null) return null;

  return (
    <div className="flex min-h-dvh flex-col bg-[#09090b] text-white">
      <AuthenticatedHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-6 py-16">
        <section className="w-full border border-cyan-300/25 bg-[linear-gradient(145deg,#1b1d20,#101113)] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-10">
          <p className="font-mono text-[10px] tracking-[0.28em] text-cyan-300">
            LOW_LATENCY_ROOM / RUST_AUDIO_APP
          </p>
          <div className="mt-6 flex flex-wrap items-start justify-between gap-6 border-b border-white/10 pb-7">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{session.name}</h1>
              <p className="mt-3 text-sm text-zinc-400">
                영상과 브라우저 음성은 사용하지 않습니다. 전용 앱에서 저지연 오디오를 연결합니다.
              </p>
            </div>
            <span className="border border-fuchsia-400/40 bg-fuchsia-400/5 px-5 py-3 font-mono text-xs tracking-[0.16em] text-fuchsia-200">
              INVITE {session.inviteCode}
            </span>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatusCard
              label="AUDIO APP"
              value={isInstallModalOpen ? '설치 확인 필요' : '실행 요청 완료'}
              active={!isInstallModalOpen}
            />
            <StatusCard label="ROOM SERVER" value={socket.isConnected ? '연결됨' : '연결 중'} active={socket.isConnected} />
            <StatusCard label="MR" value="각자 로컬 재생" active />
          </div>

          <div className="mt-8 border border-white/10 bg-black/20 p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-mono text-sm text-zinc-200">참가자 {participants.length}/{session.maxParticipants}</h2>
              <span className="font-mono text-[9px] text-zinc-600">NO VIDEO · NO BROWSER AUDIO</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {participants.map((participant) => (
                <div key={participant.id} className="flex items-center justify-between border border-white/10 bg-white/[0.025] px-4 py-3">
                  <span className="text-sm text-zinc-200">{participant.nickname}</span>
                  <span className="font-mono text-[9px] text-cyan-300">
                    {participant.id === session.myParticipantId ? 'ME' : participant.connectionStatus}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button type="button" onClick={reopenAudioApp} className="mt-8 h-14 w-full border border-cyan-300/60 bg-cyan-300/10 font-semibold text-cyan-100 hover:bg-cyan-300/15">
            전용 앱 다시 열기
          </button>
        </section>
      </main>
      {isInstallModalOpen ? (
        <AudioAppInstallModal
          onClose={() => setIsInstallModalOpen(false)}
          onRetry={reopenAudioApp}
        />
      ) : null}
    </div>
  );
}

function AudioAppInstallModal({ onClose, onRetry }: { onClose: () => void; onRetry: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="audio-app-install-title"
        className="w-full max-w-lg border border-cyan-300/35 bg-[#17191c] p-7 shadow-[0_24px_90px_rgba(0,0,0,0.7)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="font-mono text-[10px] tracking-[0.25em] text-cyan-300">
          LOW LATENCY AUDIO · WINDOWS
        </p>
        <h2 id="audio-app-install-title" className="mt-4 text-2xl font-black text-white">
          전용 오디오 앱이 필요합니다
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          앱 실행을 확인하지 못했습니다. 설치 파일을 실행하면 고급 모드용 앱과
          ssafystar:// 연결이 함께 등록됩니다.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <a
            href="/downloads/SSAFYStar-LowLatencyAudio-Setup-x64.msi?v=0.1.4"
            download
            className="grid h-12 place-items-center border border-cyan-300/60 bg-cyan-300/10 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/20"
          >
            Windows 앱 다운로드
          </a>
          <button
            type="button"
            onClick={onRetry}
            className="h-12 border border-white/15 bg-white/[0.04] text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08]"
          >
            이미 설치함 · 다시 실행
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full py-2 text-xs text-zinc-500 hover:text-zinc-300"
        >
          닫기
        </button>
      </section>
    </div>
  );
}

function StatusCard({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="border border-white/10 bg-black/20 p-4">
      <p className="font-mono text-[9px] tracking-[0.16em] text-zinc-600">{label}</p>
      <p className={`mt-2 text-sm ${active ? 'text-cyan-200' : 'text-zinc-400'}`}>{value}</p>
    </div>
  );
}
