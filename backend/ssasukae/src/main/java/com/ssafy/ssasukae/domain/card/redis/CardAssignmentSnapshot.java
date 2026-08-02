package com.ssafy.ssasukae.domain.card.redis;

import java.time.OffsetDateTime;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.ssafy.ssasukae.domain.card.type.CardTier;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectTargetType;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;

@JsonIgnoreProperties(ignoreUnknown = true)
// 현재 카드 할당 정보 스냅샷 (카드를 누가 소유하고 있는지, 사용했는지 안했는지 정보 저장)
public record CardAssignmentSnapshot(
    Long roomId,
    Long performanceId,
    Long participantId,
    Long userId,
    Long cardId,
    String cardCode,
    String cardName,
    String description,
    CardEffectType effectType,
    CardEffectTargetType targetType,
    Integer effectValue,
    Integer durationSeconds,
    CardTier tier,
    CardAssignmentStatus status,
    OffsetDateTime assignedAt,
    OffsetDateTime usedAt) {

  // 배정된 카드 사용 처리 스냅샷 생성 메서드
  public CardAssignmentSnapshot used(OffsetDateTime usedAt) {
    return new CardAssignmentSnapshot(
        roomId,
        performanceId,
        participantId,
        userId,
        cardId,
        cardCode,
        cardName,
        description,
        effectType,
        targetType,
        effectValue,
        durationSeconds,
        tier,
        CardAssignmentStatus.USED,
        assignedAt,
        usedAt);
  }
}
