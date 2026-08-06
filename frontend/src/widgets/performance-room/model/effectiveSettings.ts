import type { PerformanceSettings } from '@/entities/performance';

import { TEMPO_STEP_PERCENT } from '../config/dspParams';
import type { ActiveCardEffect } from './cardStore';

const KEY_OFFSET_MIN = -6;
const KEY_OFFSET_MAX = 6;
const TEMPO_PERCENT_MIN = 50;
const TEMPO_PERCENT_MAX = 150;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 카드 효과까지 반영한, 실제로 소리 나는 값 */
export interface EffectiveSettings {
  keyOffset: number;
  tempoPercent: number;
}

/**
 * 가창자가 맞춘 값 위에 수성전 공격 카드의 키·템포 효과를 겹친다.
 *
 * 서버(PerformanceService)와 같은 식(base + value, clamp)이어야 실제 재생과 어긋나지 않는다.
 * 기본 설정은 건드리지 않으므로 CARD_EFFECT_ENDED로 효과가 사라지면 자동으로 복구된다.
 *
 * 오디오 엔진(가창자)·가사 시계(청자)·무대 표시가 모두 같은 값을 봐야 하므로 여기 모아 둔다.
 */
export function resolveEffectiveSettings(
  settings: PerformanceSettings,
  activeEffect: ActiveCardEffect | null,
): EffectiveSettings {
  const base = { keyOffset: settings.keyOffset, tempoPercent: settings.tempoPercent };

  if (
    activeEffect === null ||
    activeEffect.targetType !== 'PERFORMER' ||
    activeEffect.effectValue === null
  ) {
    return base;
  }

  if (activeEffect.effectType === 'MR_KEY_CHANGE') {
    return {
      ...base,
      keyOffset: clamp(base.keyOffset + activeEffect.effectValue, KEY_OFFSET_MIN, KEY_OFFSET_MAX),
    };
  }

  if (activeEffect.effectType === 'MR_TEMPO_CHANGE') {
    return {
      ...base,
      tempoPercent: clamp(
        base.tempoPercent + activeEffect.effectValue * TEMPO_STEP_PERCENT,
        TEMPO_PERCENT_MIN,
        TEMPO_PERCENT_MAX,
      ),
    };
  }

  return base;
}
