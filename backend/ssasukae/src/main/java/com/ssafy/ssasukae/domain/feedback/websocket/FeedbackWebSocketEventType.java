package com.ssafy.ssasukae.domain.feedback.websocket;

import com.ssafy.ssasukae.global.websocket.message.WebSocketEventType;

public enum FeedbackWebSocketEventType implements WebSocketEventType {
  // 실시간 점수 변경
  SCORING_PROGRESS_UPDATED;

  @Override
  public String value() {
    return name();
  }
}
