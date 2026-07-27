package com.ssafy.ssasukae.domain.performance.websocket.payload;

import com.ssafy.ssasukae.domain.performance.websocket.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.performance.websocket.type.PerformanceCancelReason;

public record PerformanceCancelledPayload(
    Long performanceId,
    Long performerParticipantId,
    PerformanceStatus previousPerformanceStatus,
    PerformanceStatus performanceStatus,
    String roomStatus,
    PerformanceCancelReason cancelReason) {}
