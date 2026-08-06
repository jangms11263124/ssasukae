'use client';

// 임시 무대 흐름 검증용 페이지 — 검증 후 삭제됩니다.
// 인원 제한(2명 이상)·곡 DB 없이 stageStore를 직접 조작해
// 일반 모드 뒷단계 화면(가창자 선택 → 선곡 → 준비 → 공연 → 채점)을 확인한다.
import { useEffect, useRef, useState } from 'react';

import type { RoomParticipant } from '@/entities/participant';
import { useRoomStore } from '@/entities/room';
import { StageAudioProvider } from '@/widgets/performance-room/model/StageAudioContext';
import { useStageStore } from '@/widgets/performance-room/model/stageStore';
import { AudioEnginePanel } from '@/widgets/performance-room/ui/audio-engine/AudioEnginePanel';
import { CenterStage } from '@/widgets/performance-room/ui/center-stage/CenterStage';
import { StageControlPanel } from '@/widgets/performance-room/ui/stage-control/StageControlPanel';

const MY_PARTICIPANT_ID = 1;

const MOCK_PARTICIPANTS: RoomParticipant[] = [
  {
    connectionStatus: 'CONNECTED',
    id: 1,
    nickname: '나(테스트)',
    profileImageUrl: null,
    stageRole: 'PARTICIPANT',
    userId: 1,
  },
  {
    connectionStatus: 'CONNECTED',
    id: 2,
    nickname: '참가자2',
    profileImageUrl: null,
    stageRole: 'PARTICIPANT',
    userId: 2,
  },
  {
    connectionStatus: 'CONNECTED',
    id: 3,
    nickname: '참가자3',
    profileImageUrl: null,
    stageRole: 'PARTICIPANT',
    userId: 3,
  },
];

const MOCK_SONG = { id: 999, title: '테스트 곡 (DB 우회)' };

export default function StageCheckPage() {
  const [isHost, setIsHost] = useState(true);
  // 실제 방에서는 서버가 mrDownloadUrl을 내려주지만 여기서는 로컬 파일로 대신한다.
  const [mrFileName, setMrFileName] = useState<string | null>(null);
  const mrObjectUrlRef = useRef<string | null>(null);

  const phase = useStageStore((state) => state.phase);
  const performerParticipantId = useStageStore((state) => state.performerParticipantId);
  const startSingerSelect = useStageStore((state) => state.startSingerSelect);
  const confirmSinger = useStageStore((state) => state.confirmSinger);
  const confirmSong = useStageStore((state) => state.confirmSong);
  const startPerformance = useStageStore((state) => state.startPerformance);
  const finishPerformance = useStageStore((state) => state.finishPerformance);
  const applyPlaybackFinished = useStageStore((state) => state.applyPlaybackFinished);
  const endStage = useStageStore((state) => state.endStage);

  const isPerformer = performerParticipantId === MY_PARTICIPANT_ID;

  // 무대 진행 패널이 roomStore 세션을 읽으므로 dev에서만 목 세션을 채운다.
  // isHost 토글이 패널의 방장 시점을 바꾼다.
  useEffect(() => {
    useRoomStore.setState({
      session: {
        roomId: 0,
        myParticipantId: MY_PARTICIPANT_ID,
        inviteCode: 'DEV000',
        name: 'DEV STAGE CHECK',
        mode: 'GENERAL',
        maxParticipants: 6,
        isHost,
        openViduSessionId: 'dev',
        openViduToken: 'dev',
      },
      participants: MOCK_PARTICIPANTS,
    });

    return () => {
      useRoomStore.setState({ session: null, participants: [] });
    };
  }, [isHost]);

  // 언마운트 시 마지막 오브젝트 URL을 회수한다
  useEffect(() => {
    return () => {
      if (mrObjectUrlRef.current !== null) {
        URL.revokeObjectURL(mrObjectUrlRef.current);
      }
    };
  }, []);

  const handleMrFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (mrObjectUrlRef.current !== null) {
      URL.revokeObjectURL(mrObjectUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    mrObjectUrlRef.current = url;
    // 서버 이벤트(applyPreparationStarted)가 채우는 필드를 dev에서만 직접 채운다
    useStageStore.setState({ mrDownloadUrl: url });
    setMrFileName(file.name);
  };

  const controls = [
    { label: '① 시작하기 (가창자 선택으로)', onClick: startSingerSelect },
    {
      label: '② 가창자: 나로 확정',
      onClick: () => confirmSinger(MY_PARTICIPANT_ID),
    },
    { label: '② 가창자: 다른 참가자로 확정', onClick: () => confirmSinger(2) },
    {
      label: '③ 곡 확정 (목 데이터, DB 우회)',
      onClick: () => confirmSong(MOCK_SONG),
    },
    { label: '④ 공연 시작', onClick: startPerformance },
    { label: '⑤ 채점 화면 (97점)', onClick: () => finishPerformance(97) },
    {
      label: '⑤ 채점 화면 (점수 없음/채점 중)',
      onClick: applyPlaybackFinished,
    },
    { label: '⑥ 무대 종료 (처음으로)', onClick: endStage },
    // ── 아래 3개는 가창자 이탈 시 재접속 카운트다운(#131) 확인용 ──
    // 서버 이벤트·스냅샷 없이 일시 중지 오버레이를 띄운다.
    {
      label: '가창자 이탈 → 일시중지',
      onClick: () => {
        confirmSinger(2);
        // 카운트다운은 가창자가 DISCONNECTED인 동안에만 뜬다.
        useRoomStore.setState({
          participants: MOCK_PARTICIPANTS.map((participant) =>
            participant.id === 2
              ? { ...participant, connectionStatus: 'DISCONNECTED' as const }
              : participant,
          ),
        });
        useStageStore.getState().applyPerformanceSuspended({
          performanceId: 1,
          performerParticipantId: 2,
          previousStatus: 'PLAYING',
          currentStatus: 'SUSPENDED',
          suspendedAt: new Date().toISOString(),
          playbackPositionMs: 0,
        });
      },
    },
    {
      label: '가창자 복귀',
      onClick: () => useRoomStore.setState({ participants: MOCK_PARTICIPANTS }),
    },
    {
      label: '새로고침 복구 (5초 전 이탈 스냅샷)',
      onClick: () => {
        endStage();
        useRoomStore.setState({
          participants: MOCK_PARTICIPANTS.map((participant) =>
            participant.id === 2
              ? { ...participant, connectionStatus: 'DISCONNECTED' as const }
              : participant,
          ),
        });
        // 새로고침 직후 서버 스냅샷으로 복구되는 경로를 그대로 태운다.
        useStageStore.getState().hydrateFromRoomSnapshot({
          name: 'DEV',
          inviteCode: 'DEV000',
          mode: 'GENERAL',
          status: 'PLAYING',
          hostUserId: 1,
          maxParticipants: 6,
          serverNow: new Date().toISOString(),
          participants: [],
          playback: null,
          performance: {
            performanceId: 7,
            status: 'SUSPENDED',
            suspendedFromStatus: 'PLAYING',
            performerParticipantId: 2,
            songId: 999,
            songTitle: '테스트 곡',
            artist: '테스트',
            difficultyLevel: null,
            thumbnailImageUrl: null,
            settings: { keyOffset: 0, tempoPercent: 100, mrVolumePercent: 100, echoLevel: 30 },
            preparedAt: new Date(Date.now() - 60_000).toISOString(),
            startedAt: new Date(Date.now() - 30_000).toISOString(),
            suspendedAt: new Date(Date.now() - 5_000).toISOString(),
            playbackPositionMs: 25_000,
            songDurationMs: 200_000,
            mrDownloadUrl: '',
            midiJsonDownloadUrl: '',
            lyricsDownloadUrl: '',
          },
        });
      },
    },
  ];

  return (
    <div className="min-h-dvh bg-[#0b0b0d] p-8 text-zinc-100">
      <StageAudioProvider isPerformer={isPerformer}>
        <div className="mx-auto flex max-w-[1400px] gap-6">
          <aside className="flex w-64 shrink-0 flex-col gap-2 border border-white/10 bg-[#151517] p-4">
            <p className="font-mono text-xs tracking-wide text-cyan-300">
              [DEV] STAGE FLOW :: {phase}
            </p>

            <label className="mt-2 flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={isHost}
                onChange={(event) => setIsHost(event.target.checked)}
              />
              방장 시점으로 보기
            </label>

            <div className="mt-2 flex flex-col gap-1.5">
              {controls.map(({ label, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="border border-white/15 bg-black/40 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
              ③은 곡 검색 모달을 거치지 않고 바로 READY 단계로 넘어갑니다. 곡 검색 모달 UI 자체를
              보려면 ②에서 &lsquo;나로 확정&rsquo;을 누르세요.
            </p>

            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="font-mono text-xs tracking-wide text-cyan-300">[DEV] 오디오 엔진</p>
              <label className="mt-2 block cursor-pointer border border-white/15 bg-black/40 px-3 py-2 text-xs text-zinc-300 transition-colors hover:border-cyan-300/60 hover:text-cyan-200">
                MR 파일 선택 (서버 URL 대신)
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleMrFileChange}
                  className="hidden"
                />
              </label>
              <p className="mt-1.5 break-all text-[11px] leading-relaxed text-zinc-500">
                {mrFileName === null
                  ? '파일을 고르고 ①~④ 순서로 진행하면 공연 시작 시 재생됩니다. 이어폰 착용을 권장합니다(에코 테스트 시 하울링 방지).'
                  : `MR: ${mrFileName}`}
              </p>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <CenterStage currentParticipantId={MY_PARTICIPANT_ID} />
          </div>

          <div className="flex w-[300px] shrink-0 flex-col gap-4">
            <StageControlPanel />
            <AudioEnginePanel />
          </div>
        </div>
      </StageAudioProvider>
    </div>
  );
}
