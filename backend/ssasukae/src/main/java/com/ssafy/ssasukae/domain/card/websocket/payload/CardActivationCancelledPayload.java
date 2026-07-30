package com.ssafy.ssasukae.domain.card.websocket.payload;

import java.time.OffsetDateTime;

import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectEndReason;

public record CardActivationCancelledPayload(
    Long performanceId,
    Long cardAssignmentId,
    Long sourceParticipantId,
    Long targetParticipantId,
    Long cardId,
    String cardCode,
    String cardName,
    String cardImageUrl,
    CardEffectEndReason cancelReason,
    OffsetDateTime cancelledAt,
    Long pausedPlaybackPositionMs,
    boolean resumePlayback) {}
