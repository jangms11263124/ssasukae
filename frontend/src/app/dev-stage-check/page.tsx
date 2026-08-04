'use client';

// 임시 무대 흐름 검증용 페이지 — 검증 후 삭제됩니다.
// 인원 제한(2명 이상)·곡 DB 없이 stageStore를 직접 조작해
// 일반 모드 뒷단계 화면(가창자 선택 → 선곡 → 준비 → 공연 → 채점)을 확인한다.
import { useEffect, useRef, useState } from 'react';

import type { RoomParticipant } from '@/entities/participant';
import { useStageStore } from '@/widgets/performance-room/model/stageStore';
import { AudioEnginePanel } from '@/widgets/performance-room/ui/audio-engine/AudioEnginePanel';
import { CenterStage } from '@/widgets/performance-room/ui/center-stage/CenterStage';

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
  const startSingerSelect = useStageStore((state) => state.startSingerSelect);
  const confirmSinger = useStageStore((state) => state.confirmSinger);
  const confirmSong = useStageStore((state) => state.confirmSong);
  const startPerformance = useStageStore((state) => state.startPerformance);
  const finishPerformance = useStageStore((state) => state.finishPerformance);
  const applyPlaybackFinished = useStageStore((state) => state.applyPlaybackFinished);
  const endStage = useStageStore((state) => state.endStage);

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
    { label: '② 가창자: 나로 확정', onClick: () => confirmSinger(MY_PARTICIPANT_ID) },
    { label: '② 가창자: 다른 참가자로 확정', onClick: () => confirmSinger(2) },
    { label: '③ 곡 확정 (목 데이터, DB 우회)', onClick: () => confirmSong(MOCK_SONG) },
    { label: '④ 공연 시작', onClick: startPerformance },
    { label: '⑤ 채점 화면 (97점)', onClick: () => finishPerformance(97) },
    { label: '⑤ 채점 화면 (점수 없음/채점 중)', onClick: applyPlaybackFinished },
    { label: '⑥ 무대 종료 (처음으로)', onClick: endStage },
  ];

  return (
    <div className="min-h-dvh bg-[#0b0b0d] p-8 text-zinc-100">
      <div className="mx-auto flex max-w-[1200px] gap-6">
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
              <input type="file" accept="audio/*" onChange={handleMrFileChange} className="hidden" />
            </label>
            <p className="mt-1.5 break-all text-[11px] leading-relaxed text-zinc-500">
              {mrFileName === null
                ? '파일을 고르고 ①~④ 순서로 진행하면 공연 시작 시 재생됩니다. 이어폰 착용을 권장합니다(에코 테스트 시 하울링 방지).'
                : `MR: ${mrFileName}`}
            </p>
            <div className="mt-3">
              <AudioEnginePanel />
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <CenterStage
            currentParticipantId={MY_PARTICIPANT_ID}
            isHost={isHost}
            participants={MOCK_PARTICIPANTS}
          />
        </div>
      </div>
    </div>
  );
}
