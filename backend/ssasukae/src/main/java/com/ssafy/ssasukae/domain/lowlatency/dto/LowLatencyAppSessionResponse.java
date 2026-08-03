package com.ssafy.ssasukae.domain.lowlatency.dto;

public record LowLatencyAppSessionResponse(
    Long roomId,
    Long participantId,
    Long sessionId,
    String roomName,
    String nickname,
    String inviteCode,
    String rendezvousServer,
    String accessToken,
    String appRefreshToken,
    long accessTokenExpiresInSeconds) {}
