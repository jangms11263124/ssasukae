package com.ssafy.ssasukae.domain.user.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
@AllArgsConstructor
public class PerformanceStatResponse {
    BigDecimal avgScore;
    BigDecimal difference;
    Long totalSongs;
    LocalDateTime updatedAt;
}
