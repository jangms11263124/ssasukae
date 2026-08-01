package com.ssafy.ssasukae.domain.performance.websocket.payload;

import java.time.OffsetDateTime;

import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSettings;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

public record PerformanceResumedPayload(
    Long performanceId,
    Long performerParticipantId,
    PerformanceStatus previousStatus,
    PerformanceStatus currentStatus,
    OffsetDateTime resumeAt,
    Long resumePositionMs,
    PerformanceSettings settings) {}
