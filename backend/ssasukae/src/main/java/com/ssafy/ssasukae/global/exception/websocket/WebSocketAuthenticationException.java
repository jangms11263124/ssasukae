package com.ssafy.ssasukae.global.exception.websocket;

public class WebSocketAuthenticationException extends RuntimeException {

  private final String errorCode;

  private WebSocketAuthenticationException(String errorCode, String message) {
    super(message);
    this.errorCode = errorCode;
  }

  public static WebSocketAuthenticationException unauthorized() {
    return new WebSocketAuthenticationException(
        "WEBSOCKET_UNAUTHORIZED", "WebSocket 인증에 실패했습니다.");
  }

  public static WebSocketAuthenticationException tokenExpired() {
    return new WebSocketAuthenticationException(
        "WEBSOCKET_TOKEN_EXPIRED", "Access Token이 만료되었습니다.");
  }

  public String getErrorCode() {
    return errorCode;
  }
}
