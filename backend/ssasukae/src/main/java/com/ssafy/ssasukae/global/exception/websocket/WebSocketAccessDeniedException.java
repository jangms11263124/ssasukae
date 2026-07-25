package com.ssafy.ssasukae.global.exception.websocket;

public class WebSocketAccessDeniedException extends RuntimeException {

  public WebSocketAccessDeniedException() {
    super("허용되지 않은 WebSocket 메시지 요청입니다.");
  }
}
