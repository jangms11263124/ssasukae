package com.ssafy.ssasukae.domain.card.websocket.payload;

import java.time.OffsetDateTime;

import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectEndReason;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectTargetType;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;

public record CardEffectEndedPayload(
    Long performanceId,
    Long cardAssignmentId,
    Long sourceParticipantId,
    Long targetParticipantId,
    CardEffectTargetType targetType,
    Long cardId,
    String cardCode,
    String cardName,
    String description,
    String cardImageUrl,
    CardEffectType effectType,
    Integer effectValue,
    Integer restoredValue,
    Integer durationSeconds,
    OffsetDateTime startedAt,
    OffsetDateTime endedAt,
    CardEffectEndReason endReason) {}
