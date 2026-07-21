package com.ssafy.ssasukae.domain.performance.event;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;

public record PerformanceCancelledData(
    Long performanceId,
    Long performerParticipantId,
    Long cancelledByParticipantId,
    PerformanceStatus status,
    RoomStatus roomStatus,
    LocalDateTime cancelledAt) {}
