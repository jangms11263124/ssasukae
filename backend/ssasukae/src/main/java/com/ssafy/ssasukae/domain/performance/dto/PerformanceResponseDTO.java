package com.ssafy.ssasukae.domain.performance.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

public class PerformanceResponseDTO {
    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class RecentPerformanceDTO {
        Long performanceId;
        String title;
        String artist;
        String thumbnailUrl;
        BigDecimal score;
    }
}
