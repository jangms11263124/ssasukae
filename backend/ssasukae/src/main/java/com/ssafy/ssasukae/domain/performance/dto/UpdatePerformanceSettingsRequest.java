package com.ssafy.ssasukae.domain.performance.dto;

import com.ssafy.ssasukae.domain.performance.entity.PerformanceSettings;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record UpdatePerformanceSettingsRequest(
    @NotNull @PositiveOrZero Long expectedVersion,
    @Min(PerformanceSettings.MIN_KEY_OFFSET)
        @Max(PerformanceSettings.MAX_KEY_OFFSET)
        Integer keyOffset,
    @Min(PerformanceSettings.MIN_TEMPO_PERCENT)
        @Max(PerformanceSettings.MAX_TEMPO_PERCENT)
        Integer tempoPercent,
    @Min(PerformanceSettings.MIN_VOLUME_PERCENT)
        @Max(PerformanceSettings.MAX_VOLUME_PERCENT)
        Integer mrVolumePercent,
    @Min(PerformanceSettings.MIN_VOLUME_PERCENT)
        @Max(PerformanceSettings.MAX_VOLUME_PERCENT)
        Integer micVolumePercent,
    @Min(PerformanceSettings.MIN_EFFECT_LEVEL)
        @Max(PerformanceSettings.MAX_EFFECT_LEVEL)
        Integer echoLevel,
    @Min(PerformanceSettings.MIN_EFFECT_LEVEL)
        @Max(PerformanceSettings.MAX_EFFECT_LEVEL)
        Integer reverbLevel) {

  @AssertTrue(message = "변경할 공연 설정을 하나 이상 입력해야 합니다.")
  public boolean isUpdateRequested() {
    return keyOffset != null
        || tempoPercent != null
        || mrVolumePercent != null
        || micVolumePercent != null
        || echoLevel != null
        || reverbLevel != null;
  }
}
