package com.ssafy.ssasukae.domain.feedback.websocket.payload;

// 공연 중, 실시간 점수 변경 페이로드
public record ScoringProgressUpdatedPayload(
    Long performanceId,
    Long positionMs,
    Double pitchScore,
    Double rhythmScore) {}
