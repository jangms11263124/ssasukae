'use client';

import { useCardStore, type PendingCardActivation } from '../../model/cardStore';
import { useNicknameOf } from '../../model/useNicknameOf';
import { useRemainingSeconds } from '../../model/useRemainingSeconds';

/**
 * 카드 정체가 공개되기 전이라 효과색(CARD_EFFECT_VISUALS.accent)을 쓸 수 없다 —
 * 색만 보고 무슨 카드인지 새어 나가기 때문이다. 발동 순간 컷인에서 효과색으로 바뀌면서
 * "정체불명의 위협 → 정체 공개"로 이어진다.
 */
const THREAT_COLOR = '#ef4444';

const COUNTDOWN_STEPS = [3, 2, 1];

/**
 * 카드 발동 3초 카운트다운 티저. 누가 썼는지만 공개하고 카드 정체는
 * CARD_EFFECT_STARTED에서 공개된다. 노래는 계속 진행되므로 화면을 가리지 않는다 —
 * 컷인과 같은 밴드 형태를 쓰되 무대 중앙이 아니라 상단에 둔다.
 */
export function CardCountdownOverlay() {
  const pendingActivation = useCardStore((state) => state.pendingActivation);

  // 카운트다운이 시작될 때 밴드를 새로 마운트해야 useRemainingSeconds가 그 시점의 시계로 센다.
  if (pendingActivation === null) {
    return null;
  }

  return <CountdownBand pendingActivation={pendingActivation} />;
}

function CountdownBand({ pendingActivation }: { pendingActivation: PendingCardActivation }) {
  const nicknameOf = useNicknameOf();
  const remainingSeconds = useRemainingSeconds(pendingActivation.activateAt);

  if (remainingSeconds <= 0) {
    return null;
  }

  const sourceNickname = nicknameOf(pendingActivation.sourceParticipantId);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4"
      aria-live="off"
    >
      <div
        className="relative animate-card-cut-in overflow-hidden border-y bg-black/80 backdrop-blur-sm"
        style={{
          borderColor: `${THREAT_COLOR}99`,
          boxShadow: `0 0 32px ${THREAT_COLOR}40, inset 0 0 44px ${THREAT_COLOR}1a`,
        }}
      >
        {/* 컷인과 같은 왼쪽 액센트 바 — 두 연출이 한 흐름으로 읽히게 한다 */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ background: THREAT_COLOR }}
        />

        <div className="flex items-center gap-6 py-3 pl-6 pr-5">
          <div>
            <p
              className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em]"
              style={{ color: THREAT_COLOR }}
            >
              <span
                aria-hidden="true"
                className="size-1.5 animate-pulse rounded-full"
                style={{ background: THREAT_COLOR, boxShadow: `0 0 8px ${THREAT_COLOR}` }}
              />
              ATTACK INCOMING
            </p>

            <p className="mt-1.5 text-sm font-bold text-white">
              <span style={{ color: THREAT_COLOR }}>{sourceNickname}</span>
              님이 카드를 사용했습니다
            </p>

            {/* 가사 카운트다운(LyricsCountdown)과 같은 3·2·1 도트 — 앱 안에서 카운트다운 문법을 통일한다 */}
            <div className="mt-2.5 flex gap-1.5" aria-hidden="true">
              {COUNTDOWN_STEPS.map((step) => (
                <span
                  key={step}
                  className="size-1.5 rounded-full"
                  style={
                    step <= remainingSeconds
                      ? { background: THREAT_COLOR, boxShadow: `0 0 8px ${THREAT_COLOR}` }
                      : { background: 'rgb(255 255 255 / 20%)' }
                  }
                />
              ))}
            </div>
          </div>

          {/* 숫자마다 요소를 갈아 끼워 매 초 애니메이션이 다시 돈다 */}
          <p
            key={remainingSeconds}
            className="min-w-[3rem] text-center text-6xl font-black italic leading-none [animation:countdown-pop_1s_ease-out_both]"
            style={{ color: THREAT_COLOR, textShadow: `0 0 26px ${THREAT_COLOR}8c` }}
          >
            {remainingSeconds}
          </p>
        </div>
      </div>
    </div>
  );
}
