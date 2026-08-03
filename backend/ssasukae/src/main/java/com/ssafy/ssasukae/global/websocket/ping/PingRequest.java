package com.ssafy.ssasukae.global.websocket.ping;

import java.time.OffsetDateTime;

import jakarta.validation.constraints.NotNull;

public record PingRequest(
    @NotNull(message = "clientSentAt은 필수입니다.") OffsetDateTime clientSentAt) {}
