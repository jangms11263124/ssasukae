package com.ssafy.ssasukae.domain.lowlatency.dto;

public record LowLatencyTokenRefreshResponse(
    String accessToken, String appRefreshToken, long accessTokenExpiresInSeconds) {}
