package com.ssafy.ssasukae.global.exception.websocket;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.ALWAYS)
public record WebSocketErrorPayload(
        String code,
        String message,
        Object details
) {
}
