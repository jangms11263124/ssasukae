import { useEffect, useRef, useState } from 'react';

/**
 * 반환된 ref를 목록 하단 센티널 요소에 달면, 요소가 루트에 들어올 때 onTrigger를 호출한다.
 * root를 주면 해당 스크롤 컨테이너 기준으로 관찰하고, 없으면 뷰포트를 쓴다.
 * enabled가 false면(다음 페이지 없음, 로딩 중) 관찰하지 않는다.
 */
export function useInfiniteScrollTrigger(
  onTrigger: () => void,
  enabled: boolean,
  root: Element | null = null,
) {
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
      { root, rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, enabled, root]);

  return setSentinel;
}
