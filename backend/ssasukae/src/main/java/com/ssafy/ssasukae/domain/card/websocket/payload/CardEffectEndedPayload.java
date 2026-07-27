package com.ssafy.ssasukae.domain.card.websocket.payload;

import java.time.OffsetDateTime;

import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectEndReason;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectTargetType;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;

// 카드 효과 종료 페이로드
public record CardEffectEndedPayload(
    Long sourceParticipantId,
    Long targetParticipantId,
    CardEffectTargetType targetType,
    Long cardId,
    String cardCode,
    String cardName,
    String description,
    CardEffectType effectType,
    Integer effectValue,
    Integer restoredValue,
    Integer durationSeconds,
    OffsetDateTime startedAt,
    OffsetDateTime endedAt,
    CardEffectEndReason endReason) {}
