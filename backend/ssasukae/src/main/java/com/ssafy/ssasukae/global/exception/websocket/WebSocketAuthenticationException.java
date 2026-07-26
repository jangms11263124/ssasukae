package com.ssafy.ssasukae.global.exception.websocket;

public class WebSocketAuthenticationException extends WebSocketException {

  private WebSocketAuthenticationException(WebSocketErrorCode errorCode) {
    super(errorCode);
  }

  public static WebSocketAuthenticationException unauthorized() {
    return new WebSocketAuthenticationException(
            WebSocketErrorCode.UNAUTHORIZED
    );
  }

  public static WebSocketAuthenticationException tokenExpired() {
    return new WebSocketAuthenticationException(
            WebSocketErrorCode.TOKEN_EXPIRED
    );
  }
}
