package com.ssafy.ssasukae.domain.performance.redis.performance;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record PerformanceSettings(
        Integer keyOffset,
        Integer tempoPercent,
        Integer mrVolumePercent,
        Integer echoLevel) {

    public static PerformanceSettings defaults() {
        return new PerformanceSettings(
                0,
                100,
                100,
                0);
    }
}
