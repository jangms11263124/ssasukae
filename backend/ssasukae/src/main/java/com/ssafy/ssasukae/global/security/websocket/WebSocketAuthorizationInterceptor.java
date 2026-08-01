package com.ssafy.ssasukae.global.security.websocket;

import com.ssafy.ssasukae.global.exception.websocket.WebSocketErrorCode;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketException;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;

import java.security.Principal;

import com.ssafy.ssasukae.global.websocket.destination.WebSocketDestinations;
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

  private final AntPathMatcher pathMatcher = new AntPathMatcher();
  private final RoomParticipantRepository participantRepository;

  public WebSocketAuthorizationInterceptor(RoomParticipantRepository participantRepository) {
    this.participantRepository = participantRepository;
  }

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
      requireRoomAccess(accessor.getUser(), accessor.getDestination(), "/app/rooms/{roomId}/**");
      return message;
    }

    /*
     * SUBSCRIBE는 인증된 사용자가 허용된 구독 경로를 요청한 경우만 허용한다.
     */
    if (StompCommand.SUBSCRIBE.equals(command)) {
      requireAuthenticated(accessor.getUser());
      requireSubscriptionDestination(accessor.getDestination());
      if (matches(accessor.getDestination(), "/topic/rooms/{roomId}")) {
        requireRoomAccess(
            accessor.getUser(), accessor.getDestination(), "/topic/rooms/{roomId}");
      }
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
    if (!matches(
            destination,
            WebSocketDestinations.APPLICATION_DESTINATION_PATTERN
    )) {
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
            matches(
                    destination,
                    WebSocketDestinations.ROOM_TOPIC_SUBSCRIPTION_PATTERN
            );

    boolean userQueue =
            matches(
                    destination,
                    WebSocketDestinations.USER_QUEUE_SUBSCRIPTION_PATTERN
            );

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

  private void requireRoomAccess(
      Principal principal,
      String destination,
      String roomPattern) {
    if (!matches(destination, roomPattern)) {
      return;
    }

    Long userId = parsePositiveLong(principal.getName());
    String roomIdValue = pathMatcher.extractUriTemplateVariables(roomPattern, destination).get("roomId");
    Long roomId = parsePositiveLong(roomIdValue);

    if (participantRepository.existsByRoomIdAndUserIdAndConnectionStatus(
        roomId, userId, ConnectionStatus.KICKED)) {
      throw new WebSocketException(WebSocketErrorCode.ROOM_ACCESS_DENIED);
    }

    boolean active = participantRepository
        .findByRoomIdAndUserId(roomId, userId)
        .filter(participant -> participant.isActive())
        .isPresent();
    if (!active) {
      throw new WebSocketException(WebSocketErrorCode.ROOM_ACCESS_DENIED);
    }
  }

  private Long parsePositiveLong(String value) {
    try {
      long parsed = Long.parseLong(value);
      if (parsed <= 0) {
        throw new NumberFormatException("not positive");
      }
      return parsed;
    } catch (RuntimeException exception) {
      throw new WebSocketException(WebSocketErrorCode.ROOM_ACCESS_DENIED);
    }
  }
}
