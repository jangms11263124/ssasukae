'use client';

import { useEffect, useRef } from 'react';

/**
 * 브라우저 뒤로가기를 방 나가기 절차로 연결한다.
 *
 * 뒤로가기는 화면만 벗어날 뿐 퇴장 API를 부르지 않는다. 그러면 서버에는 참가자가 남아
 * 유령 자리가 생기고, 가창자였다면 공연이 중단된 채로 방치된다.
 *
 * 더미 히스토리 항목을 하나 쌓아 두고 뒤로가기를 가로채, 나가기 버튼과 같은 확인을 태운다.
 * 방장은 뒤로가기 한 번에 방 전체가 종료되므로 곧바로 나가지 않고 반드시 확인을 받는다.
 */
export function useLeaveRoomOnBack(onBack: () => void) {
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      // 되돌려 놓지 않으면 다음 뒤로가기에 그대로 방을 벗어난다.
      window.history.pushState(null, '', window.location.href);
      onBackRef.current();
    };

    window.addEventListener('popstate', handlePopState);

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
}
