package com.ssafy.ssasukae.domain.room.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;

import org.junit.jupiter.api.Test;

import com.ssafy.ssasukae.domain.card.redis.CardAssignmentSnapshot;
import com.ssafy.ssasukae.domain.card.redis.CardAssignmentStatus;
import com.ssafy.ssasukae.domain.card.type.CardTier;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectTargetType;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;

class CardUsageStatusResponseTest {

  @Test
  void exposesOnlyParticipantCardUsageStatus() {
    OffsetDateTime usedAt = OffsetDateTime.parse("2026-08-03T12:00:00+09:00");
    CardAssignmentSnapshot assignment =
        new CardAssignmentSnapshot(
            10L,
            20L,
            30L,
            40L,
            50L,
            "SECRET_CARD",
            "Secret card",
            "Secret description",
            CardEffectType.MR_KEY_CHANGE,
            CardEffectTargetType.PERFORMER,
            -3,
            15,
            CardTier.G,
            CardAssignmentStatus.USED,
            usedAt.minusMinutes(1),
            usedAt);

    CardUsageStatusResponse response = CardUsageStatusResponse.from(assignment);

    assertThat(response.performanceId()).isEqualTo(20L);
    assertThat(response.participantId()).isEqualTo(30L);
    assertThat(response.status()).isEqualTo(CardAssignmentStatus.USED);
    assertThat(response.usedAt()).isEqualTo(usedAt);
    assertThat(CardUsageStatusResponse.class.getRecordComponents())
        .extracting(component -> component.getName())
        .containsExactly("performanceId", "participantId", "status", "usedAt");
  }
}
