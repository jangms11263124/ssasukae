package com.ssafy.ssasukae.global.security.websocket;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ssafy.ssasukae.domain.room.service.RoomService;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketSessionRegistry;
import com.ssafy.ssasukae.global.security.jwt.ActiveSessionService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;
import com.ssafy.ssasukae.global.security.jwt.TokenBlacklistService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;

class StompJwtAuthenticationInterceptorTest {

  private static final String TOKEN = "access-token";
  private static final Long USER_ID = 1L;
  private static final String JTI = "token-id";
  private static final String SID = "sid-A";
  private static final String WEB_SOCKET_SESSION_ID = "ws-1";

  private JwtTokenProvider jwtTokenProvider;
  private TokenBlacklistService tokenBlacklistService;
  private ActiveSessionService activeSessionService;
  private RoomService roomService;
  private RoomWebSocketSessionRegistry roomSessionRegistry;
  private WebSocketLoginSessionRegistry loginSessionRegistry;
  private WebSocketSessionCloser sessionCloser;
  private StompJwtAuthenticationInterceptor interceptor;
  private MessageChannel channel;

  @BeforeEach
  void setUp() {
    jwtTokenProvider = mock(JwtTokenProvider.class);
    tokenBlacklistService = mock(TokenBlacklistService.class);
    activeSessionService = mock(ActiveSessionService.class);
    roomService = mock(RoomService.class);
    roomSessionRegistry = mock(RoomWebSocketSessionRegistry.class);
    loginSessionRegistry = mock(WebSocketLoginSessionRegistry.class);
    sessionCloser = mock(WebSocketSessionCloser.class);
    channel = mock(MessageChannel.class);

    interceptor =
        new StompJwtAuthenticationInterceptor(
            jwtTokenProvider,
            tokenBlacklistService,
            activeSessionService,
            roomService,
            roomSessionRegistry,
            loginSessionRegistry,
            sessionCloser);
  }

  @Test
  void connectRequiresBearerToken() {
    Message<byte[]> message = stompMessage(StompCommand.CONNECT, null);

    assertThatThrownBy(() -> interceptor.preSend(message, channel))
        .isInstanceOf(BadCredentialsException.class);

    verify(jwtTokenProvider, never()).validateToken(TOKEN);
  }

  @Test
  void connectRejectsInvalidToken() {
    Message<byte[]> message = stompMessage(StompCommand.CONNECT, "Bearer " + TOKEN);
    when(jwtTokenProvider.validateToken(TOKEN)).thenReturn(false);

    assertThatThrownBy(() -> interceptor.preSend(message, channel))
        .isInstanceOf(BadCredentialsException.class);
  }

  @Test
  void connectRejectsBlacklistedToken() {
    Message<byte[]> message = stompMessage(StompCommand.CONNECT, "Bearer " + TOKEN);
    stubValidToken();
    when(tokenBlacklistService.isBlacklisted(JTI)).thenReturn(true);

    assertThatThrownBy(() -> interceptor.preSend(message, channel))
        .isInstanceOf(BadCredentialsException.class);

    verify(activeSessionService, never()).isActiveSession(USER_ID, SID);
  }

  @Test
  void connectRejectsInactiveSession() {
    Message<byte[]> message = stompMessage(StompCommand.CONNECT, "Bearer " + TOKEN);
    stubValidToken();
    when(activeSessionService.isActiveSession(USER_ID, SID)).thenReturn(false);

    assertThatThrownBy(() -> interceptor.preSend(message, channel))
        .isInstanceOf(BadCredentialsException.class);
  }

  @Test
  void connectSetsAuthenticatedUserAndRegistersSid() {
    Message<byte[]> message = stompMessage(StompCommand.CONNECT, "Bearer " + TOKEN);
    stubValidToken();
    when(activeSessionService.isActiveSession(USER_ID, SID)).thenReturn(true);
    when(jwtTokenProvider.getEmail(TOKEN)).thenReturn("singer@example.com");
    when(jwtTokenProvider.getRole(TOKEN)).thenReturn("USER");

    Message<?> result = interceptor.preSend(message, channel);

    StompHeaderAccessor resultAccessor =
        MessageHeaderAccessor.getAccessor(result, StompHeaderAccessor.class);
    assertThat(resultAccessor).isNotNull();
    Authentication authentication = (Authentication) resultAccessor.getUser();
    assertThat(authentication).isNotNull();
    assertThat(authentication.getPrincipal())
        .isEqualTo(new AuthenticatedUser(USER_ID, "singer@example.com", "USER"));
    verify(loginSessionRegistry).register(WEB_SOCKET_SESSION_ID, USER_ID, SID);
  }

  @Test
  void nonConnectOrSubscribeFramePassesThrough() {
    Message<byte[]> message = stompMessage(StompCommand.SEND, null);

    assertThat(interceptor.preSend(message, channel)).isSameAs(message);

    verify(jwtTokenProvider, never()).validateToken(TOKEN);
  }

  private void stubValidToken() {
    when(jwtTokenProvider.validateToken(TOKEN)).thenReturn(true);
    when(jwtTokenProvider.getJti(TOKEN)).thenReturn(JTI);
    when(jwtTokenProvider.getUserId(TOKEN)).thenReturn(USER_ID);
    when(jwtTokenProvider.getSid(TOKEN)).thenReturn(SID);
  }

  private Message<byte[]> stompMessage(StompCommand command, String authorization) {
    StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
    accessor.setSessionId(WEB_SOCKET_SESSION_ID);
    if (authorization != null) {
      accessor.setNativeHeader("Authorization", authorization);
    }
    accessor.setLeaveMutable(true);
    return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
  }
}
