package com.ssafy.ssasukae.global.security.websocket;

import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.ssafy.ssasukae.domain.room.service.RoomService;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketSessionRegistry;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketSessionRegistry.Registration;
import com.ssafy.ssasukae.global.security.jwt.ActiveSessionService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;
import com.ssafy.ssasukae.global.security.jwt.TokenBlacklistService;

import org.springframework.http.HttpHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class StompJwtAuthenticationInterceptor implements ChannelInterceptor {

  private static final String BEARER_PREFIX = "Bearer ";
  private static final Pattern ROOM_TOPIC_PATTERN =
      Pattern.compile("^/topic/rooms/(\\d+)(?:/.*)?$");

  private final JwtTokenProvider jwtTokenProvider;
  private final TokenBlacklistService tokenBlacklistService;
  private final ActiveSessionService activeSessionService;
  private final RoomService roomService;
  private final RoomWebSocketSessionRegistry roomWebSocketSessionRegistry;
  private final WebSocketLoginSessionRegistry loginSessionRegistry;
  private final WebSocketSessionCloser webSocketSessionCloser;

  public StompJwtAuthenticationInterceptor(
      JwtTokenProvider jwtTokenProvider,
      TokenBlacklistService tokenBlacklistService,
      ActiveSessionService activeSessionService,
      RoomService roomService,
      RoomWebSocketSessionRegistry roomWebSocketSessionRegistry,
      WebSocketLoginSessionRegistry loginSessionRegistry,
      WebSocketSessionCloser webSocketSessionCloser) {
    this.jwtTokenProvider = jwtTokenProvider;
    this.tokenBlacklistService = tokenBlacklistService;
    this.activeSessionService = activeSessionService;
    this.roomService = roomService;
    this.roomWebSocketSessionRegistry = roomWebSocketSessionRegistry;
    this.loginSessionRegistry = loginSessionRegistry;
    this.webSocketSessionCloser = webSocketSessionCloser;
  }

  @Override
  public Message<?> preSend(Message<?> message, MessageChannel channel) {
    StompHeaderAccessor accessor =
        MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

    if (accessor == null) {
      return message;
    }

    if (StompCommand.CONNECT.equals(accessor.getCommand())) {
      authenticate(accessor);
    } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
      authorizeRoomSubscription(accessor);
    }

    return message;
  }

  private void authenticate(StompHeaderAccessor accessor) {
    String token = resolveToken(accessor.getFirstNativeHeader(HttpHeaders.AUTHORIZATION));
    if (!jwtTokenProvider.validateToken(token)) {
      throw new BadCredentialsException("유효하지 않은 액세스 토큰입니다.");
    }

    String jti = jwtTokenProvider.getJti(token);
    Long userId = jwtTokenProvider.getUserId(token);
    String sid = jwtTokenProvider.getSid(token);
    if (tokenBlacklistService.isBlacklisted(jti)
        || !activeSessionService.isActiveSession(userId, sid)) {
      throw new BadCredentialsException("만료된 로그인 세션입니다.");
    }

    AuthenticatedUser authenticatedUser =
        new AuthenticatedUser(
            userId, jwtTokenProvider.getEmail(token), jwtTokenProvider.getRole(token));
    UsernamePasswordAuthenticationToken authentication =
        new UsernamePasswordAuthenticationToken(
            authenticatedUser,
            null,
            List.of(new SimpleGrantedAuthority("ROLE_" + authenticatedUser.role())));
    accessor.setUser(authentication);

    loginSessionRegistry.register(requireSessionId(accessor), userId, sid);
  }

  private void authorizeRoomSubscription(StompHeaderAccessor accessor) {
    String destination = accessor.getDestination();
    if (!StringUtils.hasText(destination)) {
      return;
    }

    Matcher matcher = ROOM_TOPIC_PATTERN.matcher(destination);
    if (!matcher.matches()) {
      return;
    }

    Authentication authentication = requireAuthentication(accessor);
    AuthenticatedUser authenticatedUser = (AuthenticatedUser) authentication.getPrincipal();
    Long roomId = Long.valueOf(matcher.group(1));
    String webSocketSessionId = requireSessionId(accessor);

    Registration registration =
        roomWebSocketSessionRegistry.register(
            webSocketSessionId, roomId, authenticatedUser.userId());
    try {
      roomService.connectRoomWebSocket(roomId, authenticatedUser.userId());
    } catch (RuntimeException exception) {
      if (registration.newSession()) {
        roomWebSocketSessionRegistry.unregister(webSocketSessionId);
      }
      throw exception;
    }

    Set<String> replacedSessionIds =
        loginSessionRegistry.markOtherSessionsForReplacement(webSocketSessionId);
    webSocketSessionCloser.closeReplacedSessions(replacedSessionIds);
  }

  private Authentication requireAuthentication(StompHeaderAccessor accessor) {
    if (!(accessor.getUser() instanceof Authentication authentication)
        || !(authentication.getPrincipal() instanceof AuthenticatedUser)) {
      throw new BadCredentialsException("인증된 사용자만 방 채널을 구독할 수 있습니다.");
    }
    return authentication;
  }

  private String resolveToken(String authorization) {
    if (!StringUtils.hasText(authorization) || !authorization.startsWith(BEARER_PREFIX)) {
      throw new BadCredentialsException("유효한 Bearer 토큰이 필요합니다.");
    }

    String token = authorization.substring(BEARER_PREFIX.length());
    if (!StringUtils.hasText(token)) {
      throw new BadCredentialsException("유효한 Bearer 토큰이 필요합니다.");
    }
    return token;
  }

  private String requireSessionId(StompHeaderAccessor accessor) {
    String sessionId = accessor.getSessionId();
    if (!StringUtils.hasText(sessionId)) {
      throw new BadCredentialsException("WebSocket 세션 식별자가 없습니다.");
    }
    return sessionId;
  }
}
