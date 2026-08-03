'use client';

import { useRef } from 'react';

import type { AssignedCard } from '@/entities/card';
import { useRoomStore } from '@/entities/room';
import { useCardStore } from '@/widgets/performance-room/model/cardStore';
import { ActiveEffectBanner } from '@/widgets/performance-room/ui/cards/ActiveEffectBanner';
import { ActiveEffectPanel } from '@/widgets/performance-room/ui/cards/ActiveEffectPanel';
import { CardCountdownOverlay } from '@/widgets/performance-room/ui/cards/CardCountdownOverlay';
import { CardDealOverlay } from '@/widgets/performance-room/ui/cards/CardDealOverlay';

const TIER_DURATION = { S: 10, G: 15, P: 20 } as const;

// 등급은 효과 종류와 무관하게 지속시간으로만 정해진다. 4종 효과 × 3등급 전 조합을 순환한다.
const MOCK_CARDS: AssignedCard[] = (['S', 'G', 'P'] as const).flatMap((tier, tierIndex) => {
  const durationSeconds = TIER_DURATION[tier];

  return [
    {
      cardCode: `KEY_UP_4_${durationSeconds}`,
      cardId: tierIndex * 4 + 1,
      cardName: '키 4단계 올리기',
      description: `가창자의 MR 키를 ${durationSeconds}초 동안 4반음 높입니다.`,
      durationSeconds,
      effectType: 'MR_KEY_CHANGE' as const,
      effectValue: 4,
      participantId: 1,
      performanceId: tierIndex * 4 + 1,
      targetType: 'PERFORMER' as const,
      tier,
    },
    {
      cardCode: `TEMPO_DOWN_5_${durationSeconds}`,
      cardId: tierIndex * 4 + 2,
      cardName: '템포 5단계 내리기',
      description: `가창자의 MR 템포를 ${durationSeconds}초 동안 5단계 낮춥니다.`,
      durationSeconds,
      effectType: 'MR_TEMPO_CHANGE' as const,
      effectValue: -5,
      participantId: 1,
      performanceId: tierIndex * 4 + 2,
      targetType: 'PERFORMER' as const,
      tier,
    },
    {
      cardCode: `MIC_OPEN_${durationSeconds}`,
      cardId: tierIndex * 4 + 3,
      cardName: '마이크 난입',
      description: `마이크를 ${durationSeconds}초 동안 개방하여 무대에 난입합니다.`,
      durationSeconds,
      effectType: 'MIC_OPEN' as const,
      effectValue: null,
      participantId: 1,
      performanceId: tierIndex * 4 + 3,
      targetType: 'CARD_OWNER' as const,
      tier,
    },
    {
      cardCode: `LYRICS_HIDE_${durationSeconds}`,
      cardId: tierIndex * 4 + 4,
      cardName: '가사 가리기',
      description: `가창자의 가사를 ${durationSeconds}초 동안 가립니다.`,
      durationSeconds,
      effectType: 'LYRICS_HIDE' as const,
      effectValue: null,
      participantId: 1,
      performanceId: tierIndex * 4 + 4,
      targetType: 'PERFORMER' as const,
      tier,
    },
  ];
});

const MOCK_ATTACKER = { participantId: 501, nickname: '민석' } as const;
const MOCK_DEFENDER = { participantId: 502, nickname: '현호' } as const;

/** 오버레이가 닉네임을 찾을 수 있게 roomStore 참가자 목록에 목업 참가자를 넣는다 (중복 방지 내장) */
function seedMockParticipants() {
  const { applyParticipantJoined } = useRoomStore.getState();

  [MOCK_ATTACKER, MOCK_DEFENDER].forEach((mock, index) => {
    applyParticipantJoined({
      participantId: mock.participantId,
      userId: 9000 + index,
      nickname: mock.nickname,
      role: 'PARTICIPANT',
      participantCount: index + 1,
    });
  });
}

const DEMO_EFFECT_DURATION_SECONDS = 10;

/** 스토어를 구독하는 상호작용 데모만 클라이언트로 분리한 섹션 */
export function CardDemos() {
  const applyCardAssigned = useCardStore((state) => state.applyCardAssigned);
  const nextCardIndexRef = useRef(0);

  const triggerDeal = () => {
    applyCardAssigned(MOCK_CARDS[nextCardIndexRef.current % MOCK_CARDS.length]);
    nextCardIndexRef.current += 1;
  };

  // 실제 이벤트 순서 그대로: SCHEDULED → 3초 뒤 STARTED → 지속시간 뒤 ENDED
  const triggerActivationFlow = () => {
    seedMockParticipants();
    const cardStore = useCardStore.getState();
    const now = Date.now();

    cardStore.setClockOffset(0);
    cardStore.applyActivationScheduled({
      activateAt: new Date(now + 3000).toISOString(),
      approvedAt: new Date(now).toISOString(),
      countdownSeconds: 3,
      performanceId: 999,
      serverNow: new Date(now).toISOString(),
      sourceParticipantId: MOCK_ATTACKER.participantId,
    });

    setTimeout(() => {
      const startedAt = Date.now();
      useCardStore.getState().applyEffectStarted({
        cardCode: 'KEY_DOWN_3',
        cardId: 990,
        cardName: '키 3단계 내리기',
        description: '가창자의 MR 키를 3반음 낮춥니다.',
        durationSeconds: DEMO_EFFECT_DURATION_SECONDS,
        effectType: 'MR_KEY_CHANGE',
        effectValue: -3,
        endsAt: new Date(startedAt + DEMO_EFFECT_DURATION_SECONDS * 1000).toISOString(),
        performanceId: 999,
        sourceParticipantId: MOCK_ATTACKER.participantId,
        startedAt: new Date(startedAt).toISOString(),
        targetParticipantId: MOCK_DEFENDER.participantId,
        targetType: 'PERFORMER',
      });
    }, 3000);

    setTimeout(() => {
      const endedAt = Date.now();
      useCardStore.getState().applyEffectEnded({
        cardCode: 'KEY_DOWN_3',
        cardId: 990,
        cardName: '키 3단계 내리기',
        description: '가창자의 MR 키를 3반음 낮춥니다.',
        durationSeconds: DEMO_EFFECT_DURATION_SECONDS,
        effectType: 'MR_KEY_CHANGE',
        effectValue: -3,
        endedAt: new Date(endedAt).toISOString(),
        endReason: 'DURATION_EXPIRED',
        performanceId: 999,
        restoredValue: 0,
        sourceParticipantId: MOCK_ATTACKER.participantId,
        startedAt: new Date(endedAt - DEMO_EFFECT_DURATION_SECONDS * 1000).toISOString(),
        targetParticipantId: MOCK_DEFENDER.participantId,
        targetType: 'PERFORMER',
      });
    }, 3000 + DEMO_EFFECT_DURATION_SECONDS * 1000);
  };

  return (
    <>
      <section>
        <h2 className="mb-4 font-mono text-xs tracking-[0.2em] text-zinc-400">
          DEAL OVERLAY / 버튼 클릭 → 뒷면 클릭 → CONFIRM (누를 때마다 다른 카드)
        </h2>
        <button
          type="button"
          onClick={triggerDeal}
          className="mb-4 min-h-9 border border-cyan-400/60 bg-cyan-950/30 px-4 font-mono text-[11px] tracking-[0.12em] text-cyan-300 transition-colors hover:border-cyan-300 hover:text-cyan-200"
        >
          TRIGGER CARD_ASSIGNED
        </button>
        <div className="relative grid aspect-video max-w-3xl place-items-center overflow-hidden border border-white/10 bg-[#2c2c2f]">
          <p className="font-mono text-xs tracking-[0.2em] text-zinc-500">CENTER STAGE (MOCK)</p>
          <CardDealOverlay />
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-mono text-xs tracking-[0.2em] text-zinc-400">
          ACTIVATION FLOW / 3초 카운트다운 → {DEMO_EFFECT_DURATION_SECONDS}초 효과 → 자동 종료
        </h2>
        <button
          type="button"
          onClick={triggerActivationFlow}
          className="mb-4 min-h-9 border border-red-400/60 bg-red-950/30 px-4 font-mono text-[11px] tracking-[0.12em] text-red-300 transition-colors hover:border-red-300 hover:text-red-200"
        >
          TRIGGER ACTIVATION FLOW
        </button>
        <div className="flex max-w-5xl gap-4">
          <div className="relative grid aspect-video flex-1 place-items-center overflow-hidden border border-white/10 bg-[#2c2c2f]">
            <p className="font-mono text-xs tracking-[0.2em] text-zinc-500">
              CENTER STAGE (MOCK)
            </p>
            <CardCountdownOverlay />
            <ActiveEffectBanner />
          </div>
          <div className="w-72 shrink-0">
            <ActiveEffectPanel />
          </div>
        </div>
      </section>
    </>
  );
}
