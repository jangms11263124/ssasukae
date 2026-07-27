package com.ssafy.ssasukae.domain.performance.websocket.payload;

// 공연 시작 준비 완료됐을 때 페이로드
public record PerformancePreparationStartedPayload(
    Long performanceId,
    Long performerParticipantId,
    Long songId,
    String songTitle,
    String mrDownloadUrl,
    String midiJsonDownloadUrl) {}
