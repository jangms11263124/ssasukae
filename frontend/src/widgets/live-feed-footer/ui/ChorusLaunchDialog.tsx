'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  createRoom,
  getRoomByInviteCode,
  joinRoom,
  leaveRoom,
  type RoomInviteResponse,
} from '@/entities/room';
import { useAuth } from '@/entities/user';
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';
import { cn } from '@/shared/lib/cn';
import {
  LOW_LATENCY_APP_DOWNLOAD_URL,
  LOW_LATENCY_APP_FILE_NAME,
  launchLowLatencyApp,
} from '@/shared/lib/launchLowLatencyApp';
import { showToast } from '@/shared/model/toastStore';
import { LowLatencyAppInstallDialog } from '@/shared/ui/dialog/LowLatencyAppInstallDialog';

const INVITE_CODE_LENGTH = 6;
const ROOM_NAME_MAX_LENGTH = 20;

const MODE_LABEL = {
  BATTLE: '수성전',
  GENERAL: '일반전',
  LOW_LATENCY: '합창',
} as const;

type Tab = 'create' | 'join';

/**
 * idle        입력 대기
 * entering    방 생성·입장 API 진행 중
 * launching   딥링크를 호출하고 앱 전환을 기다리는 중
 * opened      앱으로 포커스가 넘어간 것을 확인
 * unavailable 앱 전환을 확인하지 못함 (미설치로 간주)
 */
type LaunchState = 'idle' | 'entering' | 'launching' | 'opened' | 'unavailable';

interface ChorusRoom {
  roomId: number;
  name: string;
  inviteCode: string;
}

interface ChorusLaunchDialogProps {
  onClose: () => void;
}

/** 합창(저지연) 모드 진입 모달. 웹이 방만 잡아주고 오디오는 전용 Rust 앱이 담당한다. */
export function ChorusLaunchDialog({ onClose }: ChorusLaunchDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const isMountedRef = useRef(true);
  const [tab, setTab] = useState<Tab>('create');
  const [roomName, setRoomName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [launchState, setLaunchState] = useState<LaunchState>('idle');
  const [room, setRoom] = useState<ChorusRoom | null>(null);
  /** 저지연이 아닌 초대 코드 — 로비 입장 폼으로 넘길 대상 */
  const [otherModeRoom, setOtherModeRoom] = useState<RoomInviteResponse | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isBusy = launchState === 'entering' || launchState === 'launching';

  const launch = (target: ChorusRoom) => {
    setLaunchState('launching');
    const requested = launchLowLatencyApp(target.roomId, {
      roomName: target.name,
      inviteCode: target.inviteCode,
      nickname: user?.nickname,
      onOpened: () => {
        if (isMountedRef.current) setLaunchState('opened');
      },
      onUnavailable: () => {
        if (isMountedRef.current) setLaunchState('unavailable');
      },
    });

    if (!requested) {
      setLaunchState('unavailable');
      showToast('로그인 정보를 확인한 뒤 다시 시도해 주세요.', 'error');
    }
  };

  const handleCreate = async () => {
    const name = roomName.trim();
    if (name === '' || isBusy) return;

    setLaunchState('entering');
    try {
      const session = await createRoom({ name, mode: 'LOW_LATENCY' });
      const created: ChorusRoom = {
        roomId: session.roomId,
        name,
        inviteCode: session.inviteCode,
      };
      setRoom(created);
      launch(created);
    } catch (error) {
      setLaunchState('idle');
      showToast(getApiErrorMessage(error, '합창 방을 만들지 못했어요.'), 'error');
    }
  };

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== INVITE_CODE_LENGTH || isBusy) return;

    setLaunchState('entering');
    try {
      // 들어갔다 나오는 낭비를 막으려고 입장 전에 모드를 확인한다.
      const preview = await getRoomByInviteCode(code);

      if (preview.mode !== 'LOW_LATENCY') {
        setOtherModeRoom(preview);
        setLaunchState('idle');
        return;
      }
      if (!preview.joinable) {
        setLaunchState('idle');
        showToast('지금은 들어갈 수 없는 방이에요.', 'error');
        return;
      }

      const session = await joinRoom(code);
      const joined: ChorusRoom = {
        roomId: session.roomId,
        name: preview.name,
        inviteCode: session.inviteCode,
      };
      setRoom(joined);
      launch(joined);
    } catch (error) {
      setLaunchState('idle');
      showToast(getApiErrorMessage(error, '합창 방에 들어가지 못했어요.'), 'error');
    }
  };

  // 앱이 열리지 않은 채로 닫으면 방에 참가자만 남으므로 정리한다.
  const handleClose = () => {
    if (room !== null && launchState === 'unavailable') {
      void leaveRoom(room.roomId).catch(() => {});
    }
    onClose();
  };

  const handleInstallRetry = () => {
    if (room !== null) launch(room);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            handleClose();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) handleClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="w-full max-w-lg border border-cyan-300/30 bg-[linear-gradient(145deg,#1c1c20,#101012)] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
        >
          <p className="font-mono text-[10px] tracking-[0.25em] text-cyan-300">
            CHORUS · LOW LATENCY · WINDOWS
          </p>
          <h2 id={titleId} className="mt-3 text-lg font-semibold text-zinc-100">
            합창 모드
          </h2>
          <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-zinc-400">
            합창은 전용 Windows 앱에서 해요. 여기서 방만 만들면 앱이 바로 연결돼요.
          </p>

          {!isAuthenticated ? (
            <>
              <p className="mt-5 border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-400">
                로그인하면 방을 만들거나 초대 코드로 들어갈 수 있어요. 앱은 미리 설치해 둬도
                돼요.
              </p>
              <DialogFooter onClose={handleClose} />
            </>
          ) : launchState === 'opened' ? (
            <>
              <div className="mt-5 border border-cyan-300/25 bg-cyan-300/[0.05] px-4 py-4">
                <p className="font-mono text-[10px] tracking-[0.18em] text-cyan-300">
                  AUDIO APP CONNECTED
                </p>
                <p className="mt-2 text-sm text-zinc-200">
                  {room?.name ?? '합창 방'} · 이제 앱에서 오디오를 연결해 주세요.
                </p>
                {room?.inviteCode ? (
                  <p className="mt-3 font-mono text-xs tracking-[0.16em] text-fuchsia-200">
                    INVITE {room.inviteCode}
                  </p>
                ) : null}
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleInstallRetry}
                  className="h-12 border border-white/15 bg-white/[0.04] text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08]"
                >
                  앱 다시 열기
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="h-12 border border-cyan-300/60 bg-cyan-300/10 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/15"
                >
                  닫기
                </button>
              </div>
            </>
          ) : otherModeRoom !== null ? (
            <>
              <div className="mt-5 border border-amber-300/25 bg-amber-300/[0.05] px-4 py-4">
                <p className="text-sm leading-relaxed text-amber-100/90">
                  <span className="font-semibold">{otherModeRoom.name}</span> 은(는){' '}
                  {MODE_LABEL[otherModeRoom.mode]} 방이에요. 합창 방이 아니라서 전용 앱이 필요
                  없어요. 로비에서 바로 들어갈 수 있어요.
                </p>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(`/lobby?invite=${encodeURIComponent(otherModeRoom.inviteCode)}`);
                  }}
                  className="h-12 border border-cyan-300/60 bg-cyan-300/10 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/15"
                >
                  로비에서 들어가기
                </button>
                <button
                  type="button"
                  onClick={() => setOtherModeRoom(null)}
                  className="h-12 border border-white/15 bg-white/[0.04] text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08]"
                >
                  다른 코드 입력하기
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-2 gap-2">
                {(
                  [
                    ['create', '방 만들기'],
                    ['join', '초대 코드로 들어가기'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={isBusy}
                    onClick={() => setTab(value)}
                    className={cn(
                      'h-10 border text-sm transition-colors disabled:cursor-not-allowed',
                      tab === value
                        ? 'border-cyan-300/70 bg-cyan-300/10 text-cyan-100'
                        : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/25',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'create' ? (
                <div className="mt-5">
                  <label htmlFor="chorus-room-name" className="text-sm font-semibold text-zinc-200">
                    방 이름
                  </label>
                  <input
                    id="chorus-room-name"
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                    maxLength={ROOM_NAME_MAX_LENGTH}
                    placeholder="방 이름을 입력해 주세요"
                    className="mt-3 h-12 w-full border border-white/15 bg-black/25 px-4 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-300/70"
                  />
                  <p className="mt-2 text-right font-mono text-[10px] text-zinc-600">
                    {roomName.length}/{ROOM_NAME_MAX_LENGTH}
                  </p>
                  <button
                    type="button"
                    disabled={roomName.trim() === '' || isBusy}
                    onClick={handleCreate}
                    className="mt-3 h-12 w-full border border-cyan-300/60 bg-cyan-300/10 font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-zinc-600"
                  >
                    {launchStateLabel(launchState, '방 만들고 앱 열기')}
                  </button>
                </div>
              ) : (
                <div className="mt-5">
                  <label
                    htmlFor="chorus-invite-code"
                    className="text-sm font-semibold text-zinc-200"
                  >
                    초대 코드
                  </label>
                  <input
                    id="chorus-invite-code"
                    value={inviteCode}
                    onChange={(event) =>
                      setInviteCode(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^0-9A-Z]/g, '')
                          .slice(0, INVITE_CODE_LENGTH),
                      )
                    }
                    maxLength={INVITE_CODE_LENGTH}
                    placeholder="6자리 코드"
                    className="mt-3 h-12 w-full border border-white/15 bg-black/25 px-4 text-center font-mono text-lg tracking-[0.3em] text-white uppercase outline-none transition-colors placeholder:text-sm placeholder:tracking-normal placeholder:text-zinc-600 focus:border-cyan-300/70"
                  />
                  <p className="mt-2 text-xs text-zinc-600">
                    합창 방이 아니면 로비 입장 화면으로 안내해 드려요.
                  </p>
                  <button
                    type="button"
                    disabled={inviteCode.length !== INVITE_CODE_LENGTH || isBusy}
                    onClick={handleJoin}
                    className="mt-3 h-12 w-full border border-cyan-300/60 bg-cyan-300/10 font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-zinc-600"
                  >
                    {launchStateLabel(launchState, '들어가고 앱 열기')}
                  </button>
                </div>
              )}

              <DialogFooter onClose={handleClose} />
            </>
          )}
        </div>
      </div>

      <LowLatencyAppInstallDialog
        open={launchState === 'unavailable'}
        onRetry={handleInstallRetry}
        onClose={handleClose}
        closeLabel={room === null ? '닫기' : '방 나가고 닫기'}
      />
    </>
  );
}

function launchStateLabel(state: LaunchState, idleLabel: string): string {
  if (state === 'entering') return '방 준비하는 중...';
  if (state === 'launching') return '앱 여는 중...';
  return idleLabel;
}

function DialogFooter({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
      <a
        href={LOW_LATENCY_APP_DOWNLOAD_URL}
        download={LOW_LATENCY_APP_FILE_NAME}
        className="text-xs text-cyan-300 underline-offset-4 transition-colors hover:text-cyan-100 hover:underline"
      >
        Windows 앱 다운로드
      </a>
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        닫기
      </button>
    </div>
  );
}
