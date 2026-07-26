package com.ssafy.ssasukae.global.exception.websocket;

/**
 * 정상적으로 인증된 WebSocket 사용자의 기능 요청을 처리하던 중
 * 도메인 규칙을 만족하지 못했을 때 사용하는 예외이다.
 */
public class WebSocketBusinessException extends WebSocketException {

    public WebSocketBusinessException(WebSocketErrorCode errorCode) {
        super(errorCode);
    }

    public WebSocketBusinessException(
            WebSocketErrorCode errorCode,
            String message
    ) {
        super(errorCode, message);
    }

    public WebSocketBusinessException(
            WebSocketErrorCode errorCode,
            String message,
            Object details
    ) {
        super(errorCode, message, details);
    }
}
