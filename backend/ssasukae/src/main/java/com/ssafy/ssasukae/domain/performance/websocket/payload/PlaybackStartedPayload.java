package com.ssafy.ssasukae.domain.performance.websocket.payload;

import java.time.OffsetDateTime;

// 음원 재생 페이로드
public record PlaybackStartedPayload(
        Long performanceId,
        Long performerParticipantId,
        OffsetDateTime startedAt) {}
