package com.ssafy.ssasukae.domain.card.redis;

import java.time.OffsetDateTime;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectTargetType;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;

// 현재 방에서 발동 중인 카드의 완전한 실행 상태
@JsonIgnoreProperties(ignoreUnknown = true)
public record RoomCardSnapshot(
    Long roomId,
    Long performanceId,
    RoomCardStatus status,
    Long sourceParticipantId,
    Long targetParticipantId,
    Long cardId,
    String cardCode,
    String cardName,
    String description,
    String cardImageUrl,
    CardEffectType effectType,
    CardEffectTargetType targetType,
    Integer effectValue,
    Integer durationSeconds,
    Integer previousValue,
    OffsetDateTime approvedAt,
    OffsetDateTime activateAt,
    OffsetDateTime startedAt,
    OffsetDateTime endsAt) {

  public RoomCardSnapshot active(
      OffsetDateTime effectStartedAt, OffsetDateTime effectEndsAt, Integer valueBeforeEffect) {
    return new RoomCardSnapshot(
        roomId,
        performanceId,
        RoomCardStatus.ACTIVE,
        sourceParticipantId,
        targetParticipantId,
        cardId,
        cardCode,
        cardName,
        description,
        cardImageUrl,
        effectType,
        targetType,
        effectValue,
        durationSeconds,
        valueBeforeEffect,
        approvedAt,
        activateAt,
        effectStartedAt,
        effectEndsAt);
  }
}
