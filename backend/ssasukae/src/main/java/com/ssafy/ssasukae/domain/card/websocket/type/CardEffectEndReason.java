package com.ssafy.ssasukae.domain.card.websocket.type;

// 카드 효과 종료 이유
public enum CardEffectEndReason {
  DURATION_EXPIRED,
  PERFORMANCE_ENDED,
  PERFORMANCE_CANCELLED,
  PERFORMER_DISCONNECTED,
  ROOM_TERMINATED,
  SYSTEM_CANCELLED
}
