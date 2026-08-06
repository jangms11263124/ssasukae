package com.ssafy.ssasukae.domain.lowlatency.dto;

import jakarta.validation.constraints.NotBlank;

public record LowLatencyTokenRefreshRequest(
    @NotBlank(message = "appRefreshToken is required") String appRefreshToken) {}
