import { AttackCardBack, AttackCardFront, HoloMiniCard } from '@/entities/card';

import { CardDemos } from './CardDemos';

/**
 * 카드 컴포넌트 시각 확인용 데브 페이지. 배포 대상 아님 — 수성전 화면 연동 후 삭제한다.
 * 정적 카드 그리드는 서버 렌더링하고, 스토어를 구독하는 데모만 CardDemos(클라이언트)로 분리했다.
 */
export default function CardsDevPage() {
  return (
    <main className="min-h-screen space-y-10 bg-background p-10">
      <section>
        <h2 className="mb-4 font-mono text-xs tracking-[0.2em] text-zinc-400">
          FRONT / 4 TYPES × TIER
        </h2>
        <div className="flex flex-wrap gap-4">
          <AttackCardFront
            className="w-60"
            cardCode="KEY_UP_4"
            effectType="MR_KEY_CHANGE"
            tier="S"
            effectValue={4}
            durationSeconds={10}
            targetType="PERFORMER"
          />
          <AttackCardFront
            className="w-60"
            cardCode="TEMPO_DOWN_5"
            effectType="MR_TEMPO_CHANGE"
            tier="G"
            effectValue={-5}
            durationSeconds={15}
            targetType="PERFORMER"
          />
          <AttackCardFront
            className="w-60"
            cardCode="MIC_OPEN_20"
            effectType="MIC_OPEN"
            tier="P"
            durationSeconds={20}
            targetType="CARD_OWNER"
          />
          <AttackCardFront
            className="w-60"
            cardCode="LYRICS_HIDE_20"
            effectType="LYRICS_HIDE"
            tier="P"
            durationSeconds={20}
            targetType="PERFORMER"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-mono text-xs tracking-[0.2em] text-zinc-400">BACK / TIERS</h2>
        <div className="flex flex-wrap gap-4">
          <AttackCardBack className="w-60" tier="S" />
          <AttackCardBack className="w-60" tier="G" />
          <AttackCardBack className="w-60" tier="P" />
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-mono text-xs tracking-[0.2em] text-zinc-400">MINI / HOLO + USED</h2>
        <div className="flex items-end gap-8">
          <HoloMiniCard />
          <HoloMiniCard used />
        </div>
      </section>

      <CardDemos />
    </main>
  );
}
