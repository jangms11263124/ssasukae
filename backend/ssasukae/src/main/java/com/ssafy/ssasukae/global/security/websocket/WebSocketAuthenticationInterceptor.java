package com.ssafy.ssasukae.global.security.websocket;

import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketAuthenticationException;
import com.ssafy.ssasukae.global.security.jwt.ActiveSessionService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;
import com.ssafy.ssasukae.global.security.jwt.TokenBlacklistService;

import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;

import java.util.List;

import lombok.RequiredArgsConstructor;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 클라이언트가 CONNECT 프레임을 보낼 때 Authorization 헤더에서
 * 액세스 토큰을 추출해서 인증한다.
 * 인증에 성공하면 Authentication 객체를 생성하여
 * WebSocket 세션의 사용자 정보로 등록한다.
 */
@Component
@RequiredArgsConstructor
public class WebSocketAuthenticationInterceptor implements ChannelInterceptor {

  private static final String AUTHORIZATION_HEADER = "Authorization";
  private static final String BEARER_PREFIX = "Bearer ";
  private final JwtTokenProvider jwtTokenProvider;
  private final TokenBlacklistService tokenBlacklistService;
  private final ActiveSessionService activeSessionService;
  private final UserRepository userRepository;

  /**
   * 메시지가 클라이언트 인바운드 채널을 통과하기 직전에 호출된다.
   * 인증에 성공하면 원본 메시지를 그대로 반환
   */
  @Override
  public Message<?> preSend(Message<?> message, MessageChannel channel) {

    /*
     * Message 객체의 헤더를 STOMP 방식으로 조회하고 수정할 수 있는
     * StompHeaderAccessor를 가져온다.
     *
     * accessor를 통해 다음 정보에 접근할 수 있다.
     * - CONNECT, SEND, SUBSCRIBE 등의 STOMP 명령
     * - Authorization 등의 네이티브 STOMP 헤더
     * - WebSocket 세션 ID
     * - 인증된 사용자 Principal
     */
    StompHeaderAccessor accessor =
            MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

    /*
     * STOMP 헤더에 접근할 수 있고 현재 메시지가 CONNECT 명령인 경우에만 인증한다.
     *
     * SEND, SUBSCRIBE 등의 후속 메시지는 CONNECT 시 설정한 인증 정보를
     * WebSocket 세션에서 그대로 사용한다.
     */
    if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
      authenticate(accessor);
    }

    // 인증에 성공했거나 인증 대상이 아니라면 원본 메시지를 다음 단계로 전달한다.
    return message;
  }

  /**
   * STOMP CONNECT 프레임에 포함된 JWT를 검증하고 인증 정보를 등록한다.
   *
   * @param accessor CONNECT 프레임의 STOMP 헤더 접근 객체
   * @throws WebSocketAuthenticationException 토큰이 만료되었거나 유효하지 않은 경우
   */
  private void authenticate(StompHeaderAccessor accessor) {
    String token = resolveToken(accessor);

    try {
      Long userId = jwtTokenProvider.getUserId(token);
      String email = jwtTokenProvider.getEmail(token);
      String role = jwtTokenProvider.getRole(token);
      String sessionId = jwtTokenProvider.getSid(token);
      String jti = jwtTokenProvider.getJti(token);

      // 토큰이 블랙리스트에 들어가있나?
      // 활성화된 세션인가?
      // 존재하는 사용자인가?
      if (tokenBlacklistService.isBlacklisted(jti)
              || !activeSessionService.isActiveSession(userId, sessionId)
              || !userRepository.existsById(userId)) {
        throw WebSocketAuthenticationException.unauthorized();
      }

      /*
       * JWT에서 추출한 사용자 정보를 Spring Security에서 사용할
       * Principal 객체로 생성한다.
       *
       * 이후 @MessageMapping 메서드 등에서 Principal이나 Authentication을 통해
       * 현재 WebSocket 사용자의 정보를 조회할 수 있다.
       */
      AuthenticatedUser principal = new AuthenticatedUser(userId, email, role);

      /*
       * 인증이 완료된 사용자를 나타내는 Authentication 객체를 생성한다.
       * role이 USER라면 권한은 ROLE_USER가 된다.
       */
      UsernamePasswordAuthenticationToken authentication =
              new UsernamePasswordAuthenticationToken(
                      principal,
                      null,
                      List.of(new SimpleGrantedAuthority("ROLE_" + role)));

      /*
       * 인증 결과를 현재 WebSocket 세션의 사용자 정보로 등록한다.
       *
       * 이후 같은 WebSocket 연결에서 전달되는 SEND, SUBSCRIBE 메시지는
       * accessor.getUser()를 통해 이 Authentication 객체를 사용할 수 있다.
       */
      accessor.setUser(authentication);

    } catch (ExpiredJwtException e) {
      /*
       * JWT의 만료 시간이 지난 경우.
       *
       * 일반적인 인증 실패와 구분하여 클라이언트가 토큰 재발급 등의
       * 처리를 할 수 있도록 토큰 만료 예외로 변환한다.
       */
      throw WebSocketAuthenticationException.tokenExpired();

    } catch (JwtException | IllegalArgumentException e) {
      /*
       * 다음과 같은 유효하지 않은 토큰을 처리한다.
       *
       * - JWT 서명이 올바르지 않음
       * - JWT 형식이 손상됨
       * - 필요한 클레임이 없거나 잘못됨
       * - 토큰 문자열이 올바르지 않음
       */
      throw WebSocketAuthenticationException.unauthorized();
    }
  }

  /**
   * STOMP CONNECT 프레임의 Authorization 헤더에서 JWT를 추출한다.
   */
  private String resolveToken(StompHeaderAccessor accessor) {
    String authorization = accessor.getFirstNativeHeader(AUTHORIZATION_HEADER);

    if (!StringUtils.hasText(authorization)
            || !authorization.startsWith(BEARER_PREFIX)) {
      throw WebSocketAuthenticationException.unauthorized();
    }

    String token = authorization.substring(BEARER_PREFIX.length()).trim();

    if (!StringUtils.hasText(token)) {
      throw WebSocketAuthenticationException.unauthorized();
    }

    return token;
  }
}