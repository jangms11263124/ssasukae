package com.ssafy.ssasukae.domain.room.websocket;

import com.ssafy.ssasukae.domain.room.service.RoomService;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketSessionRegistry.Unregistration;
import com.ssafy.ssasukae.global.security.websocket.WebSocketLoginSessionRegistry;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Component
public class RoomWebSocketLifecycleListener {

  private final RoomWebSocketSessionRegistry roomSessionRegistry;
  private final WebSocketLoginSessionRegistry loginSessionRegistry;
  private final RoomService roomService;

  public RoomWebSocketLifecycleListener(
      RoomWebSocketSessionRegistry roomSessionRegistry,
      WebSocketLoginSessionRegistry loginSessionRegistry,
      RoomService roomService) {
    this.roomSessionRegistry = roomSessionRegistry;
    this.loginSessionRegistry = loginSessionRegistry;
    this.roomService = roomService;
  }

  @EventListener
  public void handleDisconnect(SessionDisconnectEvent event) {
    String sessionId = event.getSessionId();
    boolean replaced = loginSessionRegistry.unregister(sessionId).replaced();
    Unregistration unregistration = roomSessionRegistry.unregister(sessionId);

    if (unregistration == null || !unregistration.lastSession() || replaced) {
      return;
    }

    roomService.disconnectRoomWebSocket(
        unregistration.roomId(), unregistration.userId());
  }
}
