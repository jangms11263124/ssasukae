package com.ssafy.ssasukae.domain.performance.websocket.payload;

// 공연 설정 상태 페이로드
public record PerformanceSettingsPayload(
    Integer keyOffset,
    Integer tempoPercent,
    Integer mrVolumePercent,
    Integer micVolumePercent,
    Integer echoLevel,
    Integer reverbLevel) {}
