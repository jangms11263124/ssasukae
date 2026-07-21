package com.ssafy.ssasukae.domain.card.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import com.ssafy.ssasukae.domain.card.entity.CardDefinition;
import com.ssafy.ssasukae.domain.card.type.CardEffectType;

import org.junit.jupiter.api.Test;

class WeightedCardPickerTest {

  @Test
  void picksCardFromWeightedRange() {
    CardDefinition first =
        CardDefinition.active(
            "FIRST",
            "첫 번째",
            "첫 카드",
            CardEffectType.LYRICS_HIDDEN,
            null,
            CardDefinition.MVP_DURATION_SECONDS,
            3);
    CardDefinition second =
        CardDefinition.active(
            "SECOND",
            "두 번째",
            "두 번째 카드",
            CardEffectType.MIC_INTRUSION,
            null,
            CardDefinition.MVP_DURATION_SECONDS,
            7);

    assertThat(new WeightedCardPicker(bound -> 0).pick(List.of(first, second))).isSameAs(first);
    assertThat(new WeightedCardPicker(bound -> 2).pick(List.of(first, second))).isSameAs(first);
    assertThat(new WeightedCardPicker(bound -> 3).pick(List.of(first, second))).isSameAs(second);
    assertThat(new WeightedCardPicker(bound -> 9).pick(List.of(first, second))).isSameAs(second);
  }
}
