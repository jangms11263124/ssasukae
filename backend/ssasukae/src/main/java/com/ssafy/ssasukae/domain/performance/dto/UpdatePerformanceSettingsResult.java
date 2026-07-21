package com.ssafy.ssasukae.domain.performance.dto;

import com.ssafy.ssasukae.domain.performance.entity.PerformanceSettings;

public record UpdatePerformanceSettingsResult(
    PerformanceSettingsResponse settings,
    boolean changed) {

  public static UpdatePerformanceSettingsResult from(
      PerformanceSettings performanceSettings, boolean changed) {
    return new UpdatePerformanceSettingsResult(
        PerformanceSettingsResponse.from(performanceSettings), changed);
  }
}
