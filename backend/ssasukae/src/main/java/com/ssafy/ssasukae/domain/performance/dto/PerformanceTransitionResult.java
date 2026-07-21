package com.ssafy.ssasukae.domain.performance.dto;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

public record PerformanceTransitionResult(
    Long performanceId,
    PerformanceStatus status,
    long performanceVersion,
    LocalDateTime changedAt,
    boolean changed) {}
