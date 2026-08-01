package com.ssafy.ssasukae.domain.card.websocket.payload;

import java.time.OffsetDateTime;

import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectEndReason;

public record CardActivationCancelledPayload(
    Long performanceId,
    Long sourceParticipantId,
    CardEffectEndReason cancelReason,
    OffsetDateTime cancelledAt) {}
