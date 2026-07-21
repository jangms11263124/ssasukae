package com.ssafy.ssasukae.global.security.websocket;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Set;

import com.ssafy.ssasukae.domain.room.service.RoomService;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketSessionRegistry;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketSessionRegistry.Registration;
import com.ssafy.ssasukae.global.security.jwt.ActiveSessionService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;
import com.ssafy.ssasukae.global.security.jwt.TokenBlacklistService;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

class StompSessionReplacementInterceptorTest {

  @Test
  void roomSubscriptionClosesPreviousSessionEvenWhenSidIsSame() {
    RoomService roomService = mock(RoomService.class);
    RoomWebSocketSessionRegistry roomSessionRegistry =
        mock(RoomWebSocketSessionRegistry.class);
    WebSocketLoginSessionRegistry loginSessionRegistry =
        new WebSocketLoginSessionRegistry();
    WebSocketSessionCloser sessionCloser = mock(WebSocketSessionCloser.class);

    loginSessionRegistry.register("ws-old", 1L, "sid-A");
    loginSessionRegistry.register("ws-new", 1L, "sid-A");
    when(roomSessionRegistry.register("ws-new", 10L, 1L))
        .thenReturn(new Registration(10L, 1L, true, false));

    StompJwtAuthenticationInterceptor interceptor =
        new StompJwtAuthenticationInterceptor(
            mock(JwtTokenProvider.class),
            mock(TokenBlacklistService.class),
            mock(ActiveSessionService.class),
            roomService,
            roomSessionRegistry,
            loginSessionRegistry,
            sessionCloser);

    interceptor.preSend(roomSubscribeMessage(), mock(MessageChannel.class));

    verify(roomSessionRegistry).register("ws-new", 10L, 1L);
    verify(roomService).connectRoomWebSocket(10L, 1L);
    verify(sessionCloser).closeReplacedSessions(Set.of("ws-old"));
  }

  private Message<byte[]> roomSubscribeMessage() {
    StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
    accessor.setSessionId("ws-new");
    accessor.setDestination("/topic/rooms/10");
    accessor.setUser(
        new UsernamePasswordAuthenticationToken(
            new AuthenticatedUser(1L, "user@test.com", "USER"), null));
    accessor.setLeaveMutable(true);
    return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
  }
}
