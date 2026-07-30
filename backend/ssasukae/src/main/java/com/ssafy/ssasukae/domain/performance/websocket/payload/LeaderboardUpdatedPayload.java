package com.ssafy.ssasukae.domain.performance.websocket.payload;

import java.util.List;

// 리더보드 업데이트 페이로드
public record LeaderboardUpdatedPayload(
    Long updatedPerformanceId,
    Integer updatedFinalScore,
    List<LeaderboardItemPayload> items) {}
