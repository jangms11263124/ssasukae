'use client';

import { useState } from 'react';

import { SongSearchModal } from '@/features/song-search';
import { cn } from '@/shared/lib/cn';
import { HeartIcon } from '@/shared/ui/icons/HeartIcon';

import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useStageStore, type StageSong } from '../../model/stageStore';
import { StageButton } from './StageButton';
import { StageMessage } from './StageMessage';

interface SongSelectStageProps {
  isPerformer: boolean;
}

export function SongSelectStage({ isPerformer }: SongSelectStageProps) {
  const confirmSong = useStageStore((state) => state.confirmSong);
  const socket = useRoomSocketContext();
  const [isModalOpen, setIsModalOpen] = useState(true);

  // 서버에 공연 준비를 요청하고, 이벤트 수신 전까지는 로컬 상태로 먼저 전이한다.
  // PERFORMANCE_PREPARATION_STARTED 이벤트가 오면 서버 값(performanceId, 음원 URL)으로 덮어쓴다.
  const handleSelectSong = (song: StageSong) => {
    socket.sendPrepare(song.id);
    confirmSong(song);
  };

  if (!isPerformer) {
    return (
      <StageMessage title="가창자가 노래를 선택 중입니다..." subtitle="조금만 기다려 주세요" />
    );
  }

  return (
    <>
      <StageMessage
        title="부를 노래를 선택하세요..."
        actions={
          isModalOpen ? undefined : (
            <StageButton onClick={() => setIsModalOpen(true)}>곡 목록 열기</StageButton>
          )
        }
      />
      {isModalOpen ? (
        <SongSearchModal
          onClose={() => setIsModalOpen(false)}
          renderSongAction={(song) => (
            <>
              {/* 찜 토글 API 연동 전까지는 서버가 내려준 찜 상태를 표시만 한다. */}
              <span
                aria-label={song.favorite ? '찜한 곡' : undefined}
                className={cn('shrink-0', song.favorite ? 'text-fuchsia-500' : 'text-zinc-600')}
              >
                <HeartIcon filled={song.favorite} />
              </span>
              <button
                type="button"
                onClick={() => handleSelectSong({ id: song.songId, title: song.title })}
                className="shrink-0 border border-white/25 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
              >
                + 노래 부르기
              </button>
            </>
          )}
        />
      ) : null}
    </>
  );
}
