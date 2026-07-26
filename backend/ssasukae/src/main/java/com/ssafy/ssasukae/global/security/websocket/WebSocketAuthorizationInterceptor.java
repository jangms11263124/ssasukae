package com.ssafy.ssasukae.global.security.websocket;

import com.ssafy.ssasukae.global.exception.websocket.WebSocketErrorCode;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketException;

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

  private final AntPathMatcher pathMatcher = new AntPathMatcher();

  @Override
  public Message<?> preSend(
          Message<?> message,
          MessageChannel channel
  ) {
    StompHeaderAccessor accessor =
            MessageHeaderAccessor.getAccessor(
                    message,
                    StompHeaderAccessor.class
            );

    if (accessor == null) {
      return message;
    }

    StompCommand command = accessor.getCommand();

    /*
     * STOMP 명령이 없는 내부 메시지는 그대로 통과시킨다.
     *
     * CONNECT 인증은 WebSocketAuthenticationInterceptor에서 처리한다.
     */
    if (command == null || StompCommand.CONNECT.equals(command)) {
      return message;
    }

    /*
     * 연결 종료 요청은 인증 여부와 관계없이 허용한다.
     */
    if (StompCommand.DISCONNECT.equals(command)) {
      return message;
    }

    /*
     * 구독 해제는 인증된 사용자만 허용한다.
     */
    if (StompCommand.UNSUBSCRIBE.equals(command)) {
      requireAuthenticated(accessor.getUser());
      return message;
    }

    /*
     * SEND는 인증된 사용자가 /app/** 경로로 보내는 경우만 허용한다.
     */
    if (StompCommand.SEND.equals(command)) {
      requireAuthenticated(accessor.getUser());
      requireApplicationDestination(accessor.getDestination());
      return message;
    }

    /*
     * SUBSCRIBE는 인증된 사용자가 허용된 구독 경로를 요청한 경우만 허용한다.
     */
    if (StompCommand.SUBSCRIBE.equals(command)) {
      requireAuthenticated(accessor.getUser());
      requireSubscriptionDestination(accessor.getDestination());
      return message;
    }

    /*
     * ACK, NACK, BEGIN, COMMIT, ABORT 등
     * 명시적으로 허용하지 않은 명령은 차단한다.
     */
    throw new WebSocketException(
            WebSocketErrorCode.INVALID_REQUEST
    );
  }

  /**
   * 현재 WebSocket 메시지에 인증된 사용자 정보가 있는지 검사한다.
   */
  private void requireAuthenticated(Principal principal) {
    if (!(principal instanceof Authentication authentication)
            || !authentication.isAuthenticated()) {
      throw new WebSocketException(
              WebSocketErrorCode.UNAUTHORIZED
      );
    }
  }

  /**
   * SEND 목적지가 /app/** 경로인지 검사한다.
   */
  private void requireApplicationDestination(String destination) {
    if (!matches(destination, APPLICATION_PATTERN)) {
      throw new WebSocketException(
              WebSocketErrorCode.INVALID_SEND_DESTINATION
      );
    }
  }

  /**
   * SUBSCRIBE 목적지가 허용된 경로인지 검사한다.
   */
  private void requireSubscriptionDestination(String destination) {
    boolean roomTopic =
            matches(destination, ROOM_TOPIC_PATTERN);

    boolean userQueue =
            matches(destination, USER_QUEUE_PATTERN);

    if (!roomTopic && !userQueue) {
      throw new WebSocketException(
              WebSocketErrorCode.INVALID_SUBSCRIBE_DESTINATION
      );
    }
  }

  /**
   * 목적지가 존재하며 지정된 Ant 경로 패턴과 일치하는지 확인한다.
   */
  private boolean matches(
          String destination,
          String pattern
  ) {
    return StringUtils.hasText(destination)
            && pathMatcher.match(pattern, destination);
  }
}