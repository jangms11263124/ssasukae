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

type AttachmentKind = 'wav' | 'png' | 'txt';

const ATTACHMENTS: { kind: AttachmentKind; label: string; extension: string }[] = [
  { kind: 'wav', label: 'WAV ATTACHMENT', extension: '.wav' },
  { kind: 'png', label: 'PNG ATTACHMENT', extension: '.png' },
  { kind: 'txt', label: 'TXT ATTACHMENT', extension: '.txt' },
];

const EMPTY_FILES: Record<AttachmentKind, File | null> = { wav: null, png: null, txt: null };

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
  onChange: (value: string) => void;
}

function TextField({ id, label, placeholder, value, onChange }: TextFieldProps) {
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
  extension: string;
  file: File | null;
  onSelect: (file: File) => void;
}

function FileField({ id, label, extension, file, onSelect }: FileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    // 같은 파일을 다시 골라도 change 이벤트가 뜨도록 매번 비운다.
    event.target.value = '';

    if (!selected) {
      return;
    }

    // accept는 탐색기 필터일 뿐 강제가 아니라서(모든 파일 선택 가능) 확장자를 직접 검증한다.
    if (!selected.name.toLowerCase().endsWith(extension)) {
      showToast(`${extension} 파일만 첨부할 수 있어요.`, 'error');
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
        <ActionButton onClick={() => inputRef.current?.click()} className="w-36">
          SELECT FILE
        </ActionButton>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={extension}
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

  // 필수: 곡명·가수명·WAV. PNG(썸네일)/TXT(가사)는 백엔드 DTO 확정 전까지 선택으로 둔다.
  const canSubmit = Boolean(title.trim() && artist.trim() && files.wav) && !isPending;
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
    if (!canSubmit || !files.wav) {
      return;
    }

    uploadSong(
      {
        title: title.trim(),
        artist: artist.trim(),
        wavFile: files.wav,
        pngFile: files.png,
        txtFile: files.txt,
      },
      {
        onSuccess: () => {
          resetForm();
          showToast('곡을 추가했어요.');
        },
        onError: (error) => {
          showToast(getApiErrorMessage(error, '곡을 추가하지 못했어요.'), 'error');
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
          onChange={setTitle}
        />
        <TextField
          id="admin-song-artist"
          label="SINGER NAME_"
          placeholder="ENTER_SINGER_NAME"
          value={artist}
          onChange={setArtist}
        />
      </div>

      {ATTACHMENTS.map(({ kind, label, extension }) => (
        <FileField
          key={kind}
          id={`admin-song-${kind}`}
          label={label}
          extension={extension}
          file={files[kind]}
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
