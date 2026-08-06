'use client';

import { useRef, useState } from 'react';

import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';
import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';
import { showToast } from '@/shared/model/toastStore';
import { ActionButton } from '@/shared/ui/button/ActionButton';

import { useUploadSongMutation } from '../api/useUploadSongMutation';

const INPUT_CLASS =
  'h-[54px] w-full border border-zinc-700 bg-[#111111] px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-neon-cyan';

const LABEL_CLASS = 'block text-[0.58rem] font-bold tracking-[0.16em] text-zinc-500';

type AttachmentKind = 'mp3' | 'albumImg' | 'lyrics';

const ATTACHMENTS: {
  kind: AttachmentKind;
  label: string;
  extensions: readonly string[];
  maxSizeMb: number;
}[] = [
  { kind: 'mp3', label: 'ORIGINAL MP3 ATTACHMENT', extensions: ['.mp3'], maxSizeMb: 200 },
  {
    kind: 'albumImg',
    label: 'ALBUM IMAGE ATTACHMENT',
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxSizeMb: 20,
  },
  {
    kind: 'lyrics',
    label: 'LYRICS ATTACHMENT',
    extensions: ['.txt', '.lrc', '.json'],
    maxSizeMb: 5,
  },
];

const EMPTY_FILES: Record<AttachmentKind, File | null> = {
  mp3: null,
  albumImg: null,
  lyrics: null,
};

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
      <path
        d="M12 15V4m0 0-4 4m4-4 4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

function TextField({ id, label, placeholder, value, disabled, onChange }: TextFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(INPUT_CLASS, 'mt-3')}
      />
    </div>
  );
}

interface FileFieldProps {
  id: string;
  label: string;
  extensions: readonly string[];
  maxSizeMb: number;
  file: File | null;
  disabled: boolean;
  onSelect: (file: File) => void;
}

function FileField({
  id,
  label,
  extensions,
  maxSizeMb,
  file,
  disabled,
  onSelect,
}: FileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    // 같은 파일을 다시 골라도 change 이벤트가 뜨도록 매번 비운다.
    event.target.value = '';

    if (!selected) {
      return;
    }

    // accept는 탐색기 필터일 뿐 강제가 아니라서(모든 파일 선택 가능) 확장자를 직접 검증한다.
    const lowerCaseName = selected.name.toLowerCase();
    if (!extensions.some((extension) => lowerCaseName.endsWith(extension))) {
      showToast(`${extensions.join(', ')} 형식의 파일만 첨부할 수 있어요.`, 'error');
      return;
    }

    if (selected.size > maxSizeMb * 1024 * 1024) {
      showToast(`파일 크기는 ${maxSizeMb}MB 이하여야 해요.`, 'error');
      return;
    }

    onSelect(selected);
  };

  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>

      <div
        className={cn(INPUT_CLASS, 'mt-3 flex items-center', file ? 'text-zinc-100' : 'text-zinc-700')}
        aria-live="polite"
      >
        <span className="truncate">{file ? file.name : 'ENTER_FILE_NAME'}</span>
      </div>

      <div className="mt-3 flex justify-end">
        <ActionButton
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="w-36"
        >
          SELECT FILE
        </ActionButton>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={extensions.join(',')}
          disabled={disabled}
          onChange={handleChange}
          className="hidden"
        />
      </div>
    </div>
  );
}

export function AddSongForm() {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [files, setFiles] = useState(EMPTY_FILES);

  const { mutate: uploadSong, isPending } = useUploadSongMutation();

  const canSubmit =
    Boolean(title.trim() && artist.trim() && files.mp3 && files.albumImg && files.lyrics) &&
    !isPending;
  const isPristine = !title && !artist && Object.values(files).every((file) => !file);

  const resetForm = () => {
    setTitle('');
    setArtist('');
    setFiles(EMPTY_FILES);
  };

  const handleReset = () => {
    resetForm();
    showToast('입력 내용을 초기화했어요.');
  };

  const handleSubmit = () => {
    if (!canSubmit || !files.mp3 || !files.albumImg || !files.lyrics) {
      return;
    }

    uploadSong(
      {
        title: title.trim(),
        artist: artist.trim(),
        originalMp3: files.mp3,
        albumImg: files.albumImg,
        lyrics: files.lyrics,
      },
      {
        onSuccess: () => {
          resetForm();
          showToast('곡 분석 요청을 접수했어요.');
        },
        onError: (error) => {
          showToast(getApiErrorMessage(error, '곡 분석 요청을 접수하지 못했어요.'), 'error');
        },
      },
    );
  };

  return (
    <div className={cn(jetBrainsMono.className, 'mt-7 space-y-8')}>
      <div className="grid gap-8 sm:grid-cols-2">
        <TextField
          id="admin-song-title"
          label="SONG NAME_"
          placeholder="ENTER_SONG_NAME"
          value={title}
          disabled={isPending}
          onChange={setTitle}
        />
        <TextField
          id="admin-song-artist"
          label="SINGER NAME_"
          placeholder="ENTER_SINGER_NAME"
          value={artist}
          disabled={isPending}
          onChange={setArtist}
        />
      </div>

      {ATTACHMENTS.map(({ kind, label, extensions, maxSizeMb }) => (
        <FileField
          key={kind}
          id={`admin-song-${kind}`}
          label={label}
          extensions={extensions}
          maxSizeMb={maxSizeMb}
          file={files[kind]}
          disabled={isPending}
          onSelect={(file) => setFiles((prev) => ({ ...prev, [kind]: file }))}
        />
      ))}

      <div className="flex justify-end gap-3 pt-1">
        <ActionButton onClick={handleReset} disabled={isPristine || isPending} className="w-36">
          RESET FORM
        </ActionButton>

        <ActionButton
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-44"
        >
          <UploadIcon />
          {isPending ? 'UPLOADING...' : 'ADD SONG'}
        </ActionButton>
      </div>
    </div>
  );
}
