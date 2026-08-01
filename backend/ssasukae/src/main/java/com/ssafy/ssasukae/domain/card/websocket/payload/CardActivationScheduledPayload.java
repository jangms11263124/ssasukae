package com.ssafy.ssasukae.domain.card.websocket.payload;

import java.time.OffsetDateTime;

public record CardActivationScheduledPayload(
    Long performanceId,
    Long sourceParticipantId,
    OffsetDateTime serverNow,
    Integer countdownSeconds,
    OffsetDateTime approvedAt,
    OffsetDateTime activateAt) {}
