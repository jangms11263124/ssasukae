package com.ssafy.ssasukae.domain.performance.websocket.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

// 공연 준비 요청
public record PerformancePrepareRequest(
        @NotNull(message = "songId는 필수입니다.")
        @Positive(message = "songId는 양의 정수여야 합니다.")
        Long songId) {}
