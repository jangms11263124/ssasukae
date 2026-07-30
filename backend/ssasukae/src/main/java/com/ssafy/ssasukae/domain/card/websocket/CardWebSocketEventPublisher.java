package com.ssafy.ssasukae.domain.card.websocket;

import org.springframework.stereotype.Component;

import com.ssafy.ssasukae.global.websocket.destination.WebSocketDestinations;
import com.ssafy.ssasukae.global.websocket.message.WebSocketEvent;
import com.ssafy.ssasukae.global.websocket.publisher.WebSocketEventPublisher;

@Component
public class CardWebSocketEventPublisher {

  private final WebSocketEventPublisher eventPublisher;

  public CardWebSocketEventPublisher(WebSocketEventPublisher eventPublisher) {
    this.eventPublisher = eventPublisher;
  }

  public void publishToRoom(Long roomId, CardWebSocketEventType type, Object payload) {
    eventPublisher.publishToRoom(roomId, WebSocketEvent.roomEvent(type, roomId, payload));
  }

  public void publishToUser(Long userId, Long roomId, CardWebSocketEventType type, Object payload) {
    eventPublisher.publishToUser(
        userId.toString(),
        WebSocketDestinations.USER_CARD_QUEUE,
        WebSocketEvent.roomEvent(type, roomId, payload));
  }
}
