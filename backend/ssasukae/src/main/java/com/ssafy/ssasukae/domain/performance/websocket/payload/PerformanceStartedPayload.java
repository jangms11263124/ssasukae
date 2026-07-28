package com.ssafy.ssasukae.domain.performance.websocket.payload;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;

// 공연 시작 페이로드
public record PerformanceStartedPayload(
    Long performanceId,
    Long performerParticipantId,
    Long songId,
    PerformanceStatus performanceStatus,
    RoomStatus roomStatus) {}
