package com.ssafy.ssasukae.domain.performance.event;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;

public record PerformanceStateChangedData(
    Long performanceId,
    PerformanceStatus previousStatus,
    PerformanceStatus currentStatus,
    long performanceVersion,
    RoomStatus roomStatus,
    LocalDateTime changedAt) {}
