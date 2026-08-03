package com.ssafy.ssasukae.global.websocket.ping;

import com.ssafy.ssasukae.global.websocket.message.WebSocketEventType;

public enum SystemWebSocketEventType implements WebSocketEventType {
  PONG;

  @Override
  public String value() {
    return name();
  }
}
