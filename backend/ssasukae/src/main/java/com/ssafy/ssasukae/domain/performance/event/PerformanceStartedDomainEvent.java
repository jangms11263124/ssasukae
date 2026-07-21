package com.ssafy.ssasukae.domain.performance.event;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

public record PerformanceStartedDomainEvent(
    Long roomId,
    long roomVersion,
    Long performanceId,
    Long performerParticipantId,
    Long songId,
    int roundNo,
    PerformanceStatus status) {}
