import { AddSongForm } from '@/features/admin-song-upload';
import { SettingsPanel } from '@/shared/ui/panel/SettingsPanel';

function MusicNoteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
      <path d="M9 18V5l10-2v13" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="6.5" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** 관리자 곡 추가 패널. 셸은 서버에서 렌더링하고 AddSongForm만 클라이언트 경계다. */
export function AddSongPanel() {
  return (
    <SettingsPanel title="ADD SONG" icon={<MusicNoteIcon />}>
      <AddSongForm />
    </SettingsPanel>
  );
}
