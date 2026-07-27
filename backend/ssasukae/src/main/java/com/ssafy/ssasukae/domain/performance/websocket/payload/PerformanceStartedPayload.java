package com.ssafy.ssasukae.domain.performance.websocket.payload;

import com.ssafy.ssasukae.domain.performanceResult.type.PerformanceStatus;

// 공연 시작 페이로드
public record PerformanceStartedPayload(
    Long performanceId,
    Long performerParticipantId,
    Long songId,
    PerformanceStatus performanceStatus,
    String roomStatus) {}
