package com.ssafy.ssasukae.domain.card.websocket.payload;

import java.time.OffsetDateTime;

import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectTargetType;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;

public record CardEffectStartedPayload(
    Long performanceId,
    Long sourceParticipantId,
    Long targetParticipantId,
    CardEffectTargetType targetType,
    Long cardId,
    String cardCode,
    String cardName,
    String description,
    CardEffectType effectType,
    Integer effectValue,
    Integer durationSeconds,
    OffsetDateTime startedAt,
    OffsetDateTime endsAt) {}
