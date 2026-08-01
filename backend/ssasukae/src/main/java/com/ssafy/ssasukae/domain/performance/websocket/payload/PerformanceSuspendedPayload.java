package com.ssafy.ssasukae.domain.performance.websocket.payload;

import java.time.OffsetDateTime;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

public record PerformanceSuspendedPayload(
    Long performanceId,
    Long performerParticipantId,
    PerformanceStatus previousStatus,
    PerformanceStatus currentStatus,
    OffsetDateTime suspendedAt,
    Long playbackPositionMs) {}
