import { useEffect, useRef, useState } from 'react';

/**
 * 반환된 ref를 목록 하단 센티널 요소에 달면, 요소가 뷰포트에 들어올 때 onTrigger를 호출한다.
 * enabled가 false면(다음 페이지 없음, 로딩 중) 관찰하지 않는다.
 */
export function useInfiniteScrollTrigger(onTrigger: () => void, enabled: boolean) {
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);
  const onTriggerRef = useRef(onTrigger);

  useEffect(() => {
    onTriggerRef.current = onTrigger;
  });

  useEffect(() => {
    if (!sentinel || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onTriggerRef.current();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, enabled]);

  return setSentinel;
}
