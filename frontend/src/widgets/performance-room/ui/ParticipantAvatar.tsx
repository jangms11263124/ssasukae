import { cn } from '@/shared/lib/cn';

/** 이 패턴에 맞는 URL만 <img>로 그린다. 상대 경로·빈 값은 이니셜 폴백 */
const HTTP_URL_PATTERN = /^https?:\/\//;

interface ParticipantAvatarProps {
  className?: string;
  nickname: string;
  /** http(s) 공개 URL만 그린다. 그 외(빈 값·상대 경로)는 닉네임 이니셜로 대체한다 */
  profileImageUrl: string | null;
}

/**
 * 참가자 프로필 썸네일. 참가자 목록과 TALK 패널이 같은 얼굴을 보여줘야 해서 한 곳에 둔다.
 *
 * 크기는 호출 측이 className으로 정한다 (목록은 size-7, 채팅은 size-8).
 */
export function ParticipantAvatar({
  className,
  nickname,
  profileImageUrl,
}: ParticipantAvatarProps) {
  const hasImage = profileImageUrl !== null && HTTP_URL_PATTERN.test(profileImageUrl);

  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-white/10',
        className,
      )}
    >
      {hasImage ? (
        // next.config.ts에 remotePatterns가 없어 next/image를 쓸 수 없다.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profileImageUrl} alt="" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center font-mono text-[10px] text-zinc-400">
          {nickname.trim().charAt(0) || '?'}
        </span>
      )}
    </span>
  );
}
