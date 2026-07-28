package com.ssafy.ssasukae.domain.performance.redis;

public record PerformanceSettings(
        Integer keyOffset,
        Integer tempoPercent,
        Integer mrVolumePercent,
        Integer micVolumePercent,
        Integer echoLevel,
        Integer reverbLevel) {

    public static PerformanceSettings defaults() {
        return new PerformanceSettings(
                0,
                100,
                100,
                100,
                0,
                0);
    }
}
