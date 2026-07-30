package com.ssafy.ssasukae.domain.performanceResult.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

public class PerformanceResultRequestDTO {
    @Data
    @Builder
    @AllArgsConstructor
    public static class ScoreDTO {
        Long songId;
        Long userId;
        Integer pitchScore;
        Integer rhythmScore;
        Integer lyricsScore;
        Integer stabilityScore;
        Integer finalScore;
        String overall;
        String strength;
        String weakness;
        String tips;
    }
}
