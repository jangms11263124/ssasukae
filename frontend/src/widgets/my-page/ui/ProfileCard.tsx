'use client';

import { useState } from 'react';

import { PROFILE_IMAGE_ACCEPT, type MyPageResponse } from '@/entities/user';
import { anybody, jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';
import { ActionButton } from '@/shared/ui/button/ActionButton';

import { formatMemberSince, maskEmail } from '../lib/formatters';
import { useNicknameEdit } from '../model/useNicknameEdit';
import { PROFILE_IMAGE_EDIT_COPY, useProfileImageEdit } from '../model/useProfileImageEdit';
import { LogOutIcon, PencilIcon } from './icons';
import { NicknameField } from './NicknameField';
import { ProfileImage } from './ProfileImage';

interface ProfileCardProps {
  profile: MyPageResponse;
  isLoggingOut: boolean;
  onLogout: () => void;
}

function InfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[0.58rem] font-bold tracking-[0.16em] text-zinc-500">{label}</p>
      <div
        className={cn(
          jetBrainsMono.className,
          'mt-3 space-y-1 text-[0.66rem] leading-relaxed tracking-[0.08em] text-zinc-300',
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function ProfileCard({ profile, isLoggingOut, onLogout }: ProfileCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const nicknameEdit = useNicknameEdit({
    currentNickname: profile.nickname,
    onSaved: () => setIsEditing(false),
  });
  // ref가 포함된 객체를 그대로 쓰면 react-hooks/refs가 렌더 중 ref 접근으로 오인한다.
  const { fileInputRef, isUploading, openFilePicker, handleFileChange } = useProfileImageEdit();

  // 편집을 열고 닫을 때마다 서버 값 기준으로 되돌려, 이전 편집 흔적이 남지 않게 한다.
  const handleStartEdit = () => {
    nicknameEdit.reset();
    setIsEditing(true);
  };

  const handleCancel = () => {
    nicknameEdit.reset();
    setIsEditing(false);
  };

  return (
    <section
      className={cn(
        anybody.className,
        'relative border border-white/[0.08] bg-[linear-gradient(135deg,#1d1d1d_0%,#151515_62%,#101010_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-7',
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_4px,rgba(255,255,255,0.012)_5px)]"
      />

      <div className="relative flex flex-col gap-7 sm:flex-row sm:gap-9">
        {/* 화면에 그리지 않는 파일 선택 트리거. 연필 버튼이 대신 클릭한다. */}
        <input
          ref={fileInputRef}
          type="file"
          accept={PROFILE_IMAGE_ACCEPT}
          onChange={(event) => void handleFileChange(event)}
          className="hidden"
        />

        <ProfileImage
          profileImageUrl={profile.profileImageUrl}
          nickname={profile.nickname}
          isEditing={isEditing}
          isUploading={isUploading}
          onEditImage={openFilePicker}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {isEditing ? (
            <div className="max-w-[416px]">
              <NicknameField
                nickname={nicknameEdit.nickname}
                checkState={nicknameEdit.checkState}
                onNicknameChange={nicknameEdit.handleChange}
                onCheck={() => void nicknameEdit.handleCheck()}
              />
            </div>
          ) : (
            <h1 className="truncate text-xl font-extrabold tracking-tight text-cyan-400">
              {profile.nickname}
            </h1>
          )}

          <div className="mt-7 grid gap-7 sm:grid-cols-2">
            <InfoBlock label="AUTHENTICATION PROTOCOL">
              <p>{profile.provider}_AUTH :</p>
              <p className="truncate">{maskEmail(profile.email)}</p>
            </InfoBlock>

            <InfoBlock label="SYSTEM INTEGRATION">
              <p>MEMBER_SINCE: {formatMemberSince(profile.createdAt)}</p>
            </InfoBlock>
          </div>

          {/* 편집 중에는 저장/취소만 남긴다. 로그아웃은 편집과 무관한 데다 실수로 누르면 입력이 날아간다. */}
          <div className="mt-8 flex flex-wrap gap-3">
            {isEditing ? (
              <>
                <ActionButton
                  variant="primary"
                  onClick={() => void nicknameEdit.handleSave()}
                  disabled={!nicknameEdit.canSave}
                  className="w-44"
                >
                  {nicknameEdit.isSaving ? 'SAVING...' : 'SAVE CHANGES'}
                </ActionButton>

                <ActionButton
                  onClick={handleCancel}
                  disabled={nicknameEdit.isSaving}
                  className="w-36"
                >
                  CANCEL
                </ActionButton>
              </>
            ) : (
              <>
                <ActionButton onClick={handleStartEdit} className="w-44">
                  <PencilIcon />
                  EDIT PROFILE
                </ActionButton>

                <ActionButton
                  variant="danger"
                  onClick={onLogout}
                  disabled={isLoggingOut}
                  className="w-36"
                >
                  <LogOutIcon />
                  LOG OUT
                </ActionButton>
              </>
            )}
          </div>

          {isEditing && (
            <p
              className={cn(
                jetBrainsMono.className,
                'mt-4 text-[0.5rem] tracking-[0.12em] text-zinc-600',
              )}
            >
              {isUploading ? PROFILE_IMAGE_EDIT_COPY.uploading : PROFILE_IMAGE_EDIT_COPY.hint}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
