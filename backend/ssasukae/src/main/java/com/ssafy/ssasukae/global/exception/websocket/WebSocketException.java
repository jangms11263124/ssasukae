package com.ssafy.ssasukae.global.exception.websocket;

import lombok.Getter;

@Getter
public class WebSocketException extends RuntimeException {

    private final WebSocketErrorCode errorCode;
    private final Object details;

    public WebSocketException(WebSocketErrorCode errorCode) {
        this(errorCode, errorCode.getDefaultMessage(), null);
    }

    public WebSocketException(
            WebSocketErrorCode errorCode,
            String message
    ) {
        this(errorCode, message, null);
    }

    public WebSocketException(
            WebSocketErrorCode errorCode,
            String message,
            Object details
    ) {
        super(message);
        this.errorCode = errorCode;
        this.details = details;
    }
}
