package com.ssafy.ssasukae.domain.performance.websocket.payload;

import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSettings;

// 공연 설정 페이로드
public record PerformanceSettingsPayload(
        Integer keyOffset,
        Integer tempoPercent,
        Integer mrVolumePercent,
        Integer micVolumePercent,
        Integer echoLevel,
        Integer reverbLevel
) {

    public static PerformanceSettingsPayload from(
            PerformanceSettings settings
    ) {
        return new PerformanceSettingsPayload(
                settings.keyOffset(),
                settings.tempoPercent(),
                settings.mrVolumePercent(),
                settings.micVolumePercent(),
                settings.echoLevel(),
                settings.reverbLevel()
        );
    }
}