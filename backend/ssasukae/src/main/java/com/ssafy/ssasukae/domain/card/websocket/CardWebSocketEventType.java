package com.ssafy.ssasukae.domain.card.websocket;

import com.ssafy.ssasukae.global.websocket.message.WebSocketEventType;

public enum CardWebSocketEventType implements WebSocketEventType {
  // 카드 할당
  CARD_ASSIGNED,
  // 카드 사용 예정
  CARD_ACTIVATION_SCHEDULED,
  // 카드 사용 취소
  CARD_ACTIVATION_CANCELLED,
  // 카드 효과 적용 시작
  CARD_EFFECT_STARTED,
  // 카드 효과 적용 끝
  CARD_EFFECT_ENDED;

  @Override
  public String value() {
    return name();
  }
}
