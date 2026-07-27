package com.ssafy.ssasukae.domain.performance.websocket.payload;

// 공연 세팅 상태 변경 페이로드
public record PerformanceSettingsChangedPayload(
    Long changedByParticipantId,
    PerformanceSettingsPayload settings) {}
