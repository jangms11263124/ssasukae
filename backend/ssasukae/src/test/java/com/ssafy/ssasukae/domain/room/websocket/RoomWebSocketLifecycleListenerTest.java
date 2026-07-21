package com.ssafy.ssasukae.domain.room.websocket;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ssafy.ssasukae.domain.room.service.RoomService;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketSessionRegistry.Unregistration;
import com.ssafy.ssasukae.global.security.websocket.WebSocketLoginSessionRegistry;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@ExtendWith(MockitoExtension.class)
class RoomWebSocketLifecycleListenerTest {

  @Mock private RoomWebSocketSessionRegistry roomSessionRegistry;
  @Mock private WebSocketLoginSessionRegistry loginSessionRegistry;
  @Mock private RoomService roomService;
  @Mock private SessionDisconnectEvent event;

  @Test
  void replacedSessionDoesNotDisconnectParticipant() {
    when(event.getSessionId()).thenReturn("ws-old");
    when(loginSessionRegistry.unregister("ws-old"))
        .thenReturn(new WebSocketLoginSessionRegistry.Unregistration(true));
    when(roomSessionRegistry.unregister("ws-old"))
        .thenReturn(new Unregistration(10L, 1L, true));

    listener().handleDisconnect(event);

    verify(roomService, never()).disconnectRoomWebSocket(10L, 1L);
  }

  @Test
  void normalLastSessionDisconnectsParticipant() {
    when(event.getSessionId()).thenReturn("ws-1");
    when(loginSessionRegistry.unregister("ws-1"))
        .thenReturn(new WebSocketLoginSessionRegistry.Unregistration(false));
    when(roomSessionRegistry.unregister("ws-1"))
        .thenReturn(new Unregistration(10L, 1L, true));

    listener().handleDisconnect(event);

    verify(roomService).disconnectRoomWebSocket(10L, 1L);
  }

  private RoomWebSocketLifecycleListener listener() {
    return new RoomWebSocketLifecycleListener(
        roomSessionRegistry, loginSessionRegistry, roomService);
  }
}
