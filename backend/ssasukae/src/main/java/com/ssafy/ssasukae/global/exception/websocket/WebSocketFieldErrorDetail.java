package com.ssafy.ssasukae.global.exception.websocket;

public record WebSocketFieldErrorDetail(
        String field,
        String reason
) {
}
