package com.ssafy.ssasukae.global.websocket.destination;

/**
 * WebSocket/STOMP에서 사용하는 Destination 문자열을 한곳에 모아 관리하는 유틸리티 클래스
 */
public final class WebSocketDestinations {

  public static final String APPLICATION_DESTINATION_PATTERN = "/app/**";
  public static final String ROOM_TOPIC_SUBSCRIPTION_PATTERN = "/topic/rooms/**";
  public static final String USER_QUEUE_SUBSCRIPTION_PATTERN = "/user/queue/**";

  private static final String ROOM_TOPIC_FORMAT = "/topic/rooms/%d";
  private static final String USER_ROOM_QUEUE_FORMAT = "/queue/rooms/%d";

  public static final String USER_ERROR_QUEUE = "/queue/errors";
  public static final String USER_CARD_QUEUE = "/queue/cards";
  public static final String USER_PONG_QUEUE = "/queue/pong";

  private WebSocketDestinations() {
  }

  public static String roomTopic(Long roomId) {
    return ROOM_TOPIC_FORMAT.formatted(validateRoomId(roomId));
  }

  public static String userRoomQueue(Long roomId) {
    return USER_ROOM_QUEUE_FORMAT.formatted(validateRoomId(roomId));
  }

  private static long validateRoomId(Long roomId) {
    if (roomId == null || roomId <= 0) {
      throw new IllegalArgumentException("roomId는 양의 정수여야 합니다.");
    }

    return roomId;
  }
}
