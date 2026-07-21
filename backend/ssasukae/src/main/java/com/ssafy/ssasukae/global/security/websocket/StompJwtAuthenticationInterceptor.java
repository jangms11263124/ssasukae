package com.ssafy.ssasukae.global.security.websocket;

import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.ssafy.ssasukae.global.security.jwt.ActiveSessionService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;
import com.ssafy.ssasukae.global.security.jwt.TokenBlacklistService;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class StompJwtAuthenticationInterceptor implements ChannelInterceptor {

  private static final String BEARER_PREFIX = "Bearer ";

  private final JwtTokenProvider jwtTokenProvider;
  private final TokenBlacklistService tokenBlacklistService;
  private final ActiveSessionService activeSessionService;

  @Override
  public Message<?> preSend(Message<?> message, MessageChannel channel) {
    StompHeaderAccessor accessor =
        MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

    if (accessor == null || !StompCommand.CONNECT.equals(accessor.getCommand())) {
      return message;
    }

    String token = resolveToken(accessor.getFirstNativeHeader(HttpHeaders.AUTHORIZATION));
    authenticate(accessor, token);
    return message;
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

  private void authenticate(StompHeaderAccessor accessor, String token) {
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
  }
}
