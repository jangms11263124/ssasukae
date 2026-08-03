package com.ssafy.ssasukae.domain.feedback.dto;

import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultRequestDTO;
import lombok.*;
import java.util.List;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public class FeedbackResponseDTO {
    @Data
    @Builder
    public static class FeedbackSummaryDTO {
        Long totalSongs;
        BigDecimal avgScore;
    }

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class FeedbackListDTO {
        List<FeedbackItemDTO> feedbacks;
        Long nextCursor;
        boolean hasNext;
        Long total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FeedbackItemDTO {
        Long feedbackId;
        Long songId;
        String title;
        String artist;
        String thumbnail;
        LocalDateTime singAt;
        String overall;
        Integer score;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FeedbackDetailDTO {
        Long performanceId;
        String title;
        String artist;
        String thumbnail;
        ScoreDTO scores;
        String overall;
        String strength;
        String weakness;
        String tip;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ScoreDTO {
        Integer pitch;
        Integer rhythm;
        Integer lyricsAccuracy;
        Integer stability;
        Integer difficulty;
        Integer total;
    }
}