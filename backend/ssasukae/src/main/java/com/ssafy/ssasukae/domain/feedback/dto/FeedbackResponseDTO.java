package com.ssafy.ssasukae.domain.feedback.dto;

import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;

import java.math.BigDecimal;

public class FeedbackResponseDTO {
    @Data
    @Builder
    public static class FeedbackSummaryDTO {
        Long totalSongs;
        BigDecimal avgScore;
    }
}