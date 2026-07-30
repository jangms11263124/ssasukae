package com.ssafy.ssasukae.domain.performanceResult.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

public class PerformanceResultRequestDTO {

  @Data
  @Builder
  @NoArgsConstructor
  @AllArgsConstructor
  public static class ScoreDTO {

    @NotNull @Positive Long songId;

    @NotNull @Positive Long userId;

    @NotNull
    @Min(0)
    @Max(100)
    Integer pitchScore;

    @NotNull
    @Min(0)
    @Max(100)
    Integer rhythmScore;

    @NotNull
    @Min(0)
    @Max(100)
    Integer lyricsScore;

    @Min(0)
    @Max(100)
    Integer stabilityScore;

    @NotNull
    @Min(0)
    @Max(100)
    Integer finalScore;

    String overall;
    String strength;
    String weakness;
    String tips;
  }
}
