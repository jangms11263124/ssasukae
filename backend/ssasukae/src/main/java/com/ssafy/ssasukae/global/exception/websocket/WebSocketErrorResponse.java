package com.ssafy.ssasukae.global.exception.websocket;

import java.time.OffsetDateTime;
import java.time.ZoneId;

public record WebSocketErrorResponse(
        String eventType,
        OffsetDateTime occurredAt,
        WebSocketErrorPayload payload
) {

    private static final String ERROR_EVENT_TYPE = "ERROR";
    private static final ZoneId SEOUL_ZONE_ID = ZoneId.of("Asia/Seoul");

    public static WebSocketErrorResponse from(WebSocketException exception) {
        return of(
                exception.getErrorCode(),
                exception.getMessage(),
                exception.getDetails()
        );
    }

    public static WebSocketErrorResponse of(WebSocketErrorCode errorCode) {
        return of(
                errorCode,
                errorCode.getDefaultMessage(),
                null
        );
    }

    public static WebSocketErrorResponse of(
            WebSocketErrorCode errorCode,
            String message
    ) {
        return of(errorCode, message, null);
    }

    public static WebSocketErrorResponse of(
            WebSocketErrorCode errorCode,
            String message,
            Object details
    ) {
        return new WebSocketErrorResponse(
                ERROR_EVENT_TYPE,
                OffsetDateTime.now(SEOUL_ZONE_ID),
                new WebSocketErrorPayload(
                        errorCode.name(),
                        message,
                        details
                )
        );
    }
}
