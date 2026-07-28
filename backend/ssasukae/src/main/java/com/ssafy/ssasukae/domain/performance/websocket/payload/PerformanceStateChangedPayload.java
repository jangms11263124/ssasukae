package com.ssafy.ssasukae.domain.performance.websocket.payload;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

// 공연 상태 변경 페이로드
public record PerformanceStateChangedPayload(
    Long performanceId,
    com.ssafy.ssasukae.domain.performance.type.PerformanceStatus previousStatus,
    PerformanceStatus currentStatus) {}
