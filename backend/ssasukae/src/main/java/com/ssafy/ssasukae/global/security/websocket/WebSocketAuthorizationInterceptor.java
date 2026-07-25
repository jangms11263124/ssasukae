package com.ssafy.ssasukae.global.security.websocket;

import com.ssafy.ssasukae.global.exception.websocket.WebSocketAccessDeniedException;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketAuthenticationException;

import java.security.Principal;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;

/**
 * 클라이언트가 서버로 보내는 STOMP 메시지의 접근 권한을 검사하는 인터셉터.
 */
@Component
public class WebSocketAuthorizationInterceptor implements ChannelInterceptor {

  /**
   * 클라이언트가 서버의 @MessageMapping 메서드로 메시지를 보낼 때 사용하는 경로 패턴.
   */
  private static final String APPLICATION_PATTERN = "/app/**";

  /**
   * 방 단위 브로드캐스트 메시지를 구독하는 경로 패턴.
   */
  private static final String ROOM_TOPIC_PATTERN = "/topic/rooms/**";

  /**
   * 특정 사용자에게 전달되는 개인 메시지를 구독하는 경로 패턴.
   */
  private static final String USER_QUEUE_PATTERN = "/user/queue/**";

  /**
   * Ant 스타일 경로 패턴을 비교하기 위한 객체.
   */
  private final AntPathMatcher pathMatcher = new AntPathMatcher();

  @Override
  public Message<?> preSend(Message<?> message, MessageChannel channel) {

    /*
     * Message 객체의 헤더를 STOMP 관점에서 조회할 수 있는 접근 객체를 가져온다.
     *
     */
    StompHeaderAccessor accessor =
            MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

    /*
     * 현재 메시지에서 STOMP 헤더 접근 객체를 가져올 수 없다면
     * 별도의 권한 검사를 하지 않고 원본 메시지를 그대로 통과시킨다.
     */
    if (accessor == null) {
      return message;
    }

    // 현재 메시지의 STOMP 명령을 가져온다.
    StompCommand command = accessor.getCommand();

    /*
     * STOMP 명령이 없는 내부 메시지는 그대로 통과시킨다.
     *
     * CONNECT 메시지도 여기서는 검사하지 않는다.
     * CONNECT 인증은 일반적으로 별도의 인증 인터셉터에서 JWT를 검증하고
     * accessor.setUser(authentication)을 호출하여 처리한다.
     */
    if (command == null || StompCommand.CONNECT.equals(command)) {
      return message;
    }

    /*
     * 연결 종료 요청은 인증 여부와 관계없이 허용한다.
     *
     * 토큰이 만료되었거나 인증 정보가 사라진 상태에서도
     * 클라이언트가 연결을 종료할 수 있어야 하기 때문이다.
     */
    if (StompCommand.DISCONNECT.equals(command)) {
      return message;
    }

    /*
     * 구독 해제는 인증된 사용자만 허용한다.
     *
     * UNSUBSCRIBE는 일반적으로 destination 대신
     * SUBSCRIBE 프레임에서 사용했던 구독 ID를 전달한다.
     * 따라서 여기서는 목적지 검사를 하지 않는다.
     */
    if (StompCommand.UNSUBSCRIBE.equals(command)) {
      requireAuthenticated(accessor.getUser());
      return message;
    }

    /*
     * 클라이언트가 서버에 메시지를 보내는 SEND 명령 처리.
     *
     * 1. 현재 사용자가 인증되어 있는지 검사한다.
     * 2. 목적지가 /app/** 경로인지 검사한다.
     *
     * 클라이언트가 /topic/** 또는 /queue/**로 직접 메시지를 보내는 것을 차단한다.
     * 브로커 목적지로 메시지를 발행하는 책임은 서버에 두는 것이다.
     */
    if (StompCommand.SEND.equals(command)) {
      requireAuthenticated(accessor.getUser());
      requireDestination(accessor.getDestination());
      return message;
    }

    /*
     * 클라이언트가 서버 메시지를 구독하는 SUBSCRIBE 명령 처리.
     *
     * 인증된 사용자만 다음 경로를 구독할 수 있다.
     * - /topic/rooms/**: 방 단위 브로드캐스트
     * - /user/queue/**: 사용자 개인 메시지
     */
    if (StompCommand.SUBSCRIBE.equals(command)) {
      requireAuthenticated(accessor.getUser());

      // 클라이언트가 구독하려는 STOMP 목적지를 가져온다.
      String destination = accessor.getDestination();

      /*
       * 허용된 구독 경로가 아니라면 접근을 거부한다.
       *
       * 예:
       * - /topic/rooms/1     → 허용
       * - /user/queue/errors → 허용
       * - /topic/admin       → 거부
       * - /queue/global      → 거부
       */
      if (!matches(destination, ROOM_TOPIC_PATTERN)
              && !matches(destination, USER_QUEUE_PATTERN)) {
        throw new WebSocketAccessDeniedException();
      }

      return message;
    }

    /*
     * 위에서 명시적으로 허용하지 않은 STOMP 명령은 모두 차단한다.
     *
     * 현재 정책에서는 ACK, NACK, BEGIN, COMMIT, ABORT 등의 명령도
     * 이 지점에서 거부된다.
     */
    throw new WebSocketAccessDeniedException();
  }

  /**
   * 현재 WebSocket 메시지에 인증된 사용자 정보가 있는지 검사한다.
   *
   * @param principal WebSocket 세션에 등록된 사용자 정보
   * @throws WebSocketAuthenticationException 인증 정보가 없거나 인증되지 않은 경우
   */
  private void requireAuthenticated(Principal principal) {

    /*
     * 인증 인터셉터에서 정상적으로 인증했다면 Principal에는
     * UsernamePasswordAuthenticationToken 등의 Authentication 객체가 들어 있다.
     *
     * 다음 경우 인증 실패로 처리한다.
     * - principal이 null인 경우
     * - principal이 Authentication 타입이 아닌 경우
     * - authentication.isAuthenticated()가 false인 경우
     */
    if (!(principal instanceof Authentication authentication)
            || !authentication.isAuthenticated()) {
      throw WebSocketAuthenticationException.unauthorized();
    }
  }

  /**
   * SEND 메시지의 목적지가 서버 애플리케이션 경로인지 검사한다.
   *
   * @param destination 클라이언트가 메시지를 보내려는 목적지
   * @throws WebSocketAccessDeniedException /app/** 경로가 아닌 경우
   */
  private void requireDestination(String destination) {

    /*
     * 클라이언트의 SEND는 /app/** 경로로만 허용한다.
     *
     * 허용:
     * - /app/rooms/1/chat
     * - /app/rooms/1/performance/start
     *
     * 거부:
     * - /topic/rooms/1
     * - /user/queue/errors
     */
    if (!matches(destination, APPLICATION_PATTERN)) {
      throw new WebSocketAccessDeniedException();
    }
  }

  /**
   * 목적지가 비어 있지 않고 지정된 Ant 경로 패턴과 일치하는지 확인한다.
   *
   * @param destination 실제 STOMP 목적지
   * @param pattern 허용할 경로 패턴
   * @return 목적지가 존재하면서 패턴과 일치하면 true
   */
  private boolean matches(String destination, String pattern) {

    /*
     * destination이 null이거나 빈 문자열이면 false를 반환한다.
     * 값이 있다면 AntPathMatcher를 이용해 패턴을 비교한다.
     */
    return StringUtils.hasText(destination)
            && pathMatcher.match(pattern, destination);
  }
}