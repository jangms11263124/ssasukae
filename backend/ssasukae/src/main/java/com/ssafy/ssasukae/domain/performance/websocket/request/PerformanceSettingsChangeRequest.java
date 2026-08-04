package com.ssafy.ssasukae.domain.performance.websocket.request;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;

// 공연 세팅 정보 변경 요청
@JsonIgnoreProperties(ignoreUnknown = true)
public record PerformanceSettingsChangeRequest(
        @NotNull(message = "keyOffset은 필수입니다.") Integer keyOffset,
        @NotNull(message = "tempoPercent는 필수입니다.") Integer tempoPercent,
        @NotNull(message = "mrVolumePercent는 필수입니다.") Integer mrVolumePercent,
        @NotNull(message = "echoLevel은 필수입니다.") Integer echoLevel) {}
