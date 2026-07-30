package com.ssafy.ssasukae.domain.performance.websocket.payload;

// 리더보드 세부 요소 페이로드
public record LeaderboardItemPayload(
    // 순위
    Integer rank,
    Long performanceId,
    Long participantId,
    String nickname,
    Long songId,
    String songTitle,
    Integer finalScore) {}
