package com.ssafy.ssasukae.domain.performanceResult.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

public class PerformanceResultResponseDTO {
    @Data
    @Builder
    @AllArgsConstructor
    public static class PerformanceIdDTO {
        Long performanceId;
    }
}
