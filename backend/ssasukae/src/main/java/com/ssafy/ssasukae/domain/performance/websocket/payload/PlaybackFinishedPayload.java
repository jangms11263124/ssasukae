package com.ssafy.ssasukae.domain.performance.websocket.payload;

import java.time.OffsetDateTime;

// 음원 종료 페이로드
public record PlaybackFinishedPayload(
        Long performanceId,
        Long performerParticipantId,
        OffsetDateTime finishedAt) {}
