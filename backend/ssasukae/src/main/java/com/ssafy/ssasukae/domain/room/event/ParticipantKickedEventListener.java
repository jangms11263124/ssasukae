package com.ssafy.ssasukae.domain.room.event;

import java.util.Set;

import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketSessionRegistry;
import com.ssafy.ssasukae.global.security.websocket.WebSocketSessionCloser;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class ParticipantKickedEventListener {

  private final RoomRealtimeEventPublisher roomRealtimeEventPublisher;
  private final RoomWebSocketSessionRegistry roomWebSocketSessionRegistry;
  private final WebSocketSessionCloser webSocketSessionCloser;

  public ParticipantKickedEventListener(
      RoomRealtimeEventPublisher roomRealtimeEventPublisher,
      RoomWebSocketSessionRegistry roomWebSocketSessionRegistry,
      WebSocketSessionCloser webSocketSessionCloser) {
    this.roomRealtimeEventPublisher = roomRealtimeEventPublisher;
    this.roomWebSocketSessionRegistry = roomWebSocketSessionRegistry;
    this.webSocketSessionCloser = webSocketSessionCloser;
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void handle(ParticipantKickedDomainEvent event) {
    try {
      roomRealtimeEventPublisher.publishRoomEvent(
          event.roomId(),
          event.version(),
          RealtimeEventType.PARTICIPANT_KICKED,
          new ParticipantKickedData(
              event.participantId(),
              event.userId(),
              event.nickname(),
              event.kickedByUserId(),
              event.participantCount()));
    } finally {
      Set<String> sessionIds =
          roomWebSocketSessionRegistry.findSessionIds(event.roomId(), event.userId());
      webSocketSessionCloser.closeKickedSessions(sessionIds);
    }
  }
}
