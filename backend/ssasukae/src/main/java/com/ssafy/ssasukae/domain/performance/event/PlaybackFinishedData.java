package com.ssafy.ssasukae.domain.performance.event;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

public record PlaybackFinishedData(
    Long performanceId,
    Long performerParticipantId,
    PerformanceStatus status,
    LocalDateTime finishedAt) {}
