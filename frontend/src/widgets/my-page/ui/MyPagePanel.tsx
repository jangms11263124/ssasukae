'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useMyPageQuery } from '@/entities/user';
import { useLogoutMutation } from '@/features/auth-logout';
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';
import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';
import { showToast } from '@/shared/model/toastStore';

import { FavoritesCard } from './FavoritesCard';
import { MyPageSkeleton } from './MyPageSkeleton';
import { PerformanceStatusCard } from './PerformanceStatusCard';
import { ProfileCard } from './ProfileCard';
import { RecentActivityCard } from './RecentActivityCard';

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    // 배경 오버레이가 absolute라, static으로 두면 페인트 순서상 그라디언트에 가려진다.
    <div className="relative grid flex-1 place-items-center py-24">
      <p
        className={cn(
          jetBrainsMono.className,
          'text-[0.6rem] tracking-[0.14em] text-fuchsia-400',
        )}
      >
        {children}
      </p>
    </div>
  );
}

/** 마이페이지의 클라이언트 경계. 정적 셸은 app/mypage/page.tsx가 서버에서 렌더링한다. */
export function MyPagePanel() {
  const { data: profile, isError, error } = useMyPageQuery();
  const { mutateAsync: logout } = useLogoutMutation();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 헤더 프로필 메뉴의 로그아웃과 동일하게 동작해야 하므로 처리 방식을 맞춘다.
  const handleLogout = async () => {
    setIsLoggingOut(true);

    try {
      await logout();
    } catch {
      showToast('로그아웃하지 못했어요.', 'error');
    }

    // 요청이 실패해도 onSettled에서 로컬 세션은 정리되므로 로그인 페이지로 이동시킨다
    router.replace('/login');
  };

  if (!profile) {
    return isError ? (
      <ErrorMessage>
        [ERROR] {getApiErrorMessage(error, '마이페이지를 불러오지 못했어요.')}
      </ErrorMessage>
    ) : (
      // 토큰 복구 전에는 쿼리가 disabled라 isLoading이 false다. 둘 다 데이터 대기 상태이므로 스켈레톤으로 덮는다.
      <MyPageSkeleton />
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
      <ProfileCard
        profile={profile}
        isLoggingOut={isLoggingOut}
        onLogout={() => void handleLogout()}
      />

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(20rem,1fr)_minmax(0,2fr)]">
        <FavoritesCard count={profile.favorites.count} items={profile.favorites.items} />

        <div className="flex flex-col gap-4">
          <PerformanceStatusCard />
          <RecentActivityCard performances={profile.recentPerformances} />
        </div>
      </div>
    </div>
  );
}
