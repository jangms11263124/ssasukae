package com.ssafy.ssasukae.domain.room.event;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;

import java.util.Set;

import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketSessionRegistry;
import com.ssafy.ssasukae.global.security.websocket.WebSocketSessionCloser;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ParticipantKickedEventListenerTest {

  @Mock private RoomRealtimeEventPublisher publisher;
  @Mock private RoomWebSocketSessionRegistry registry;
  @Mock private WebSocketSessionCloser closer;

  @Test
  void publishesKickEventBeforeClosingTargetSessions() {
    ParticipantKickedEventListener listener =
        new ParticipantKickedEventListener(publisher, registry, closer);
    ParticipantKickedDomainEvent event =
        new ParticipantKickedDomainEvent(10L, 8L, 102L, 2L, "대상", 1L, 2);
    Set<String> sessionIds = Set.of("ws-target");
    when(registry.findSessionIds(10L, 2L)).thenReturn(sessionIds);

    listener.handle(event);

    InOrder order = inOrder(publisher, registry, closer);
    order.verify(publisher)
        .publishRoomEvent(
            10L,
            8L,
            RealtimeEventType.PARTICIPANT_KICKED,
            new ParticipantKickedData(102L, 2L, "대상", 1L, 2));
    order.verify(registry).findSessionIds(10L, 2L);
    order.verify(closer).closeKickedSessions(sessionIds);
  }
}
