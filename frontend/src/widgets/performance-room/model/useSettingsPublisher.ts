import type { PerformanceSettings } from '@/entities/performance';

import { useRoomSocketContext } from './RoomSocketContext';
import { useStageStore } from './stageStore';

const SETTINGS_PUBLISH_DEBOUNCE_MS = 400;

/**
 * 슬라이더(AudioEnginePanel)와 제스처가 하나의 디바운스를 공유하도록 모듈 스코프에 둔다.
 * 훅 안에 useRef로 두면 인스턴스마다 타이머가 생겨 두 경로가 서로 다른 스냅샷을
 * 번갈아 발행한다. 방은 한 번에 하나만 열리므로 모듈 스코프로 충분하다.
 *
 * 언마운트 때 지우지 않는 것도 공유 때문이다. 공연 중에만 사는 제스처 훅이 사라질 때
 * 지우면 항상 떠 있는 슬라이더가 방금 예약한 발행까지 취소된다. 늦게 터져도 콜백이
 * 스토어를 다시 읽고 performanceId로 가드하므로 무해하다.
 */
let publishTimerId: number | null = null;

export function useSettingsPublisher() {
  const socket = useRoomSocketContext();

  return (patch: Partial<PerformanceSettings>) => {
    // 화면에는 즉시 반영하고 서버 발행만 묶어서 늦춘다.
    const store = useStageStore.getState();
    store.applySettingsChanged({ ...store.settings, ...patch });

    if (publishTimerId !== null) {
      window.clearTimeout(publishTimerId);
    }

    publishTimerId = window.setTimeout(() => {
      publishTimerId = null;

      const { performanceId, settings } = useStageStore.getState();

      // 공연이 없으면 로컬 프리셋으로만 남긴다.
      if (performanceId !== null) {
        socket.sendSettings(settings);
      }
    }, SETTINGS_PUBLISH_DEBOUNCE_MS);
  };
}
