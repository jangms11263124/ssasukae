'use client';

// 임시 무대 흐름 검증용 페이지 — 검증 후 삭제됩니다.
// 인원 제한(2명 이상)·곡 DB 없이 stageStore를 직접 조작해
// 일반 모드 뒷단계 화면(가창자 선택 → 선곡 → 준비 → 공연 → 채점)을 확인한다.
import { useState } from 'react';

import type { RoomParticipant } from '@/entities/participant';
import { useStageStore } from '@/widgets/performance-room/model/stageStore';
import { CenterStage } from '@/widgets/performance-room/ui/center-stage/CenterStage';

const MY_PARTICIPANT_ID = 1;

const MOCK_PARTICIPANTS: RoomParticipant[] = [
  { connectionStatus: 'CONNECTED', id: 1, nickname: '나(테스트)', stageRole: 'PARTICIPANT', userId: 1 },
  { connectionStatus: 'CONNECTED', id: 2, nickname: '참가자2', stageRole: 'PARTICIPANT', userId: 2 },
  { connectionStatus: 'CONNECTED', id: 3, nickname: '참가자3', stageRole: 'PARTICIPANT', userId: 3 },
];

const MOCK_SONG = { id: 999, title: '테스트 곡 (DB 우회)' };

export default function StageCheckPage() {
  const [isHost, setIsHost] = useState(true);

  const phase = useStageStore((state) => state.phase);
  const startSingerSelect = useStageStore((state) => state.startSingerSelect);
  const confirmSinger = useStageStore((state) => state.confirmSinger);
  const confirmSong = useStageStore((state) => state.confirmSong);
  const startPerformance = useStageStore((state) => state.startPerformance);
  const finishPerformance = useStageStore((state) => state.finishPerformance);
  const applyPlaybackFinished = useStageStore((state) => state.applyPlaybackFinished);
  const endStage = useStageStore((state) => state.endStage);

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
