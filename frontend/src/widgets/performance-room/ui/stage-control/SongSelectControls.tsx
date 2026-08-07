import { useState } from 'react';

import { FavoriteToggleButton } from '@/features/favorite-toggle';
import { SongSearchModal } from '@/features/song-search';

import { useStageStore, type StageSong } from '../../model/stageStore';
import { StageButton } from '../center-stage/StageButton';
import { ControlMessage } from './ControlMessage';

interface SongSelectControlsProps {
  isPerformer: boolean;
}

export function SongSelectControls({ isPerformer }: SongSelectControlsProps) {
  const confirmSong = useStageStore((state) => state.confirmSong);
  // 선곡 단계에 들어오면 곡 검색 모달을 바로 연다.
  const [isModalOpen, setIsModalOpen] = useState(true);

  // 선곡은 로컬 전이만 한다. 서버 준비 요청(prepare)은 시작하기 시점에 보낸다 —
  // 노래 바꾸기가 서버 취소 없이 반복될 수 있고, 선곡만으로 방이 PLAYING으로 잠기지 않는다.
  const handleSelectSong = (song: StageSong) => {
    confirmSong(song);
  };

  if (!isPerformer) {
    return (
      <ControlMessage title="가창자가 노래를 선택 중입니다..." subtitle="조금만 기다려 주세요" />
    );
  }

  return (
    <div className="space-y-3">
      <ControlMessage title="부를 노래를 선택하세요..." />
      {isModalOpen ? null : (
        <StageButton size="sm" className="w-full min-w-0" onClick={() => setIsModalOpen(true)}>
          곡 목록 열기
        </StageButton>
      )}
      {isModalOpen ? (
        <SongSearchModal
          onClose={() => setIsModalOpen(false)}
          renderSongAction={(song) => (
            <>
              <FavoriteToggleButton songId={song.songId} favorite={song.favorite} />
              <button
                type="button"
                onClick={() =>
                  handleSelectSong({
                    id: song.songId,
                    title: song.title,
                    // 가사 싱크 조회용 곡 서명. 준비 이벤트에는 없어 여기서 미리 넘긴다.
                    artist: song.artist,
                    durationSeconds: song.durationSeconds,
                  })
                }
                className="shrink-0 border border-white/25 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
              >
                노래 부르기
              </button>
            </>
          )}
        />
      ) : null}
    </div>
  );
}
