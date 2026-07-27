package com.ssafy.ssasukae.domain.card.websocket.payload;

import java.time.OffsetDateTime;

// 카드 사용 취소 페이로드
public record CardActivationCancelledPayload(
    Long sourceParticipantId,
    Long targetParticipantId,
    Long cardId,
    String cardCode,
    String cardName,
    String reason,
    OffsetDateTime cancelledAt) {}
