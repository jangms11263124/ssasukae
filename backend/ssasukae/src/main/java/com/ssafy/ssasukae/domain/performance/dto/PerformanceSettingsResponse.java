package com.ssafy.ssasukae.domain.performance.dto;

import com.ssafy.ssasukae.domain.performance.entity.PerformanceSettings;

public record PerformanceSettingsResponse(
    Long performanceId,
    long version,
    int keyOffset,
    int tempoPercent,
    int mrVolumePercent,
    int micVolumePercent,
    int echoLevel,
    int reverbLevel) {

  public static PerformanceSettingsResponse from(PerformanceSettings settings) {
    return new PerformanceSettingsResponse(
        settings.getPerformance().getId(),
        settings.getVersion(),
        settings.getKeyOffset(),
        settings.getTempoPercent(),
        settings.getMrVolumePercent(),
        settings.getMicVolumePercent(),
        settings.getEchoLevel(),
        settings.getReverbLevel());
  }
}
