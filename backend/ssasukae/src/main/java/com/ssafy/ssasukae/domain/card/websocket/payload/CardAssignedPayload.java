package com.ssafy.ssasukae.domain.card.websocket.payload;

import com.ssafy.ssasukae.domain.card.type.CardTier;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectTargetType;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;

public record CardAssignedPayload(
    Long performanceId,
    Long participantId,
    Long cardId,
    String cardCode,
    String cardName,
    String description,
    String cardImageUrl,
    CardEffectType effectType,
    CardEffectTargetType targetType,
    Integer effectValue,
    Integer durationSeconds,
    CardTier tier) {}
