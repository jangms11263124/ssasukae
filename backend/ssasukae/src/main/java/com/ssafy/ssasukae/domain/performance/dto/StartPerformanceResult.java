package com.ssafy.ssasukae.domain.performance.dto;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

public record StartPerformanceResult(
    Long performanceId,
    Long performerParticipantId,
    Long songId,
    int roundNo,
    PerformanceStatus status) {}
