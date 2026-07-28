package com.ssafy.ssasukae.domain.performance.websocket.payload;

import com.ssafy.ssasukae.domain.performance.type.PerformanceCancelReason;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;

// 공연 취소 페이로드
public record PerformanceCancelledPayload(
    Long performanceId,
    Long performerParticipantId,
    PerformanceStatus previousPerformanceStatus,
    PerformanceStatus performanceStatus,
    RoomStatus roomStatus,
    PerformanceCancelReason cancelReason) {}
