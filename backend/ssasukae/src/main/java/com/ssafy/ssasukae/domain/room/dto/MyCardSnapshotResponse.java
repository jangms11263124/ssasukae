package com.ssafy.ssasukae.domain.room.dto;

import com.ssafy.ssasukae.domain.card.redis.CardAssignmentSnapshot;
import com.ssafy.ssasukae.domain.card.redis.CardAssignmentStatus;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;

public record MyCardSnapshotResponse(
    Long performanceId,
    CardAssignmentStatus status,
    Long cardId,
    String cardCode,
    CardEffectType effectType,
    Integer effectValue,
    Integer durationSeconds) {

  public static MyCardSnapshotResponse from(CardAssignmentSnapshot card) {
    return new MyCardSnapshotResponse(
        card.performanceId(),
        card.status(),
        card.cardId(),
        card.cardCode(),
        card.effectType(),
        card.effectValue(),
        card.durationSeconds());
  }
}
