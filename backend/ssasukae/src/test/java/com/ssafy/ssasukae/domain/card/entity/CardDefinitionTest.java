package com.ssafy.ssasukae.domain.card.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ssafy.ssasukae.domain.card.type.CardEffectType;

import org.junit.jupiter.api.Test;

class CardDefinitionTest {

  @Test
  void storesDurationDirectly() {
    CardDefinition card = card(CardEffectType.LYRICS_HIDDEN, null, 10);

    assertThat(card.getDurationSeconds()).isEqualTo(10);
  }

  @Test
  void pitchAndTempoShiftMustBePlusOrMinusSix() {
    assertThatThrownBy(() -> card(CardEffectType.PITCH_SHIFT, 5, 10))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("음정·템포 조절값은 +3 또는 -3이어야 합니다.");

    assertThat(card(CardEffectType.TEMPO_SHIFT, -3, 10).getEffectValue())
        .isEqualTo(-3);
  }

  @Test
  void nonNumericEffectsRejectEffectValue() {
    assertThatThrownBy(() -> card(CardEffectType.LYRICS_HIDDEN, 1, 10))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("해당 카드 효과에는 효과값을 지정할 수 없습니다.");
  }

  @Test
  void durationMustBePositive() {
    assertThatThrownBy(() -> card(CardEffectType.MIC_INTRUSION, null, 0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("카드 지속 시간은 1초 이상이어야 합니다.");
  }

  private CardDefinition card(
      CardEffectType effectType, Integer effectValue, int durationSeconds) {
    return CardDefinition.active(
        effectType.name(),
        "카드",
        "카드 설명",
        effectType,
        effectValue,
        durationSeconds,
        1);
  }
}
