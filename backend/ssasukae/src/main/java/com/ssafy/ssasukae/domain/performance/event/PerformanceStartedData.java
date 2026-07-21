package com.ssafy.ssasukae.domain.performance.event;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

public record PerformanceStartedData(
    Long performanceId,
    Long performerParticipantId,
    Long songId,
    int roundNo,
    PerformanceStatus status) {}
