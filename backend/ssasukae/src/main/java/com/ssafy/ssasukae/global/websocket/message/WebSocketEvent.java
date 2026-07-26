package com.ssafy.ssasukae.global.websocket.message;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Objects;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 *
 * 서버가 클라이언트에게 WebSocket 이벤트를 보낼 때 사용하는 공통 메시지 DTO
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record WebSocketEvent<T>(
        String eventType,
        Long roomId,
        OffsetDateTime occurredAt,
        // 이벤트마다 페이로드가 다르기 때문에 제네릭으로 선언
        T payload
) {

  private static final ZoneId SEOUL_ZONE_ID = ZoneId.of("Asia/Seoul");

  public WebSocketEvent {
    if (eventType == null || eventType.isBlank()) {
      throw new IllegalArgumentException("eventType은 비어 있을 수 없습니다.");
    }

    if (roomId != null && roomId <= 0) {
      throw new IllegalArgumentException("roomId는 양의 정수여야 합니다.");
    }

    Objects.requireNonNull(occurredAt, "occurredAt은 필수입니다.");
    Objects.requireNonNull(payload, "payload는 필수입니다.");
  }
  // 방과 관련 없는 일반 이벤트 생성 메서드
  public static <T> WebSocketEvent<T> event(
          WebSocketEventType eventType,
          T payload
  ) {
    return create(eventType, null, payload);
  }
  // 방과 관련된 이벤트들 생성 메서드
  public static <T> WebSocketEvent<T> roomEvent(
          WebSocketEventType eventType,
          Long roomId,
          T payload
  ) {
    return create(eventType, roomId, payload);
  }

  // 이벤트 생성 factory
  private static <T> WebSocketEvent<T> create(
          WebSocketEventType eventType,
          Long roomId,
          T payload
  ) {
    Objects.requireNonNull(eventType, "eventType은 필수입니다.");

    return new WebSocketEvent<>(
            eventType.value(),
            roomId,
            OffsetDateTime.now(SEOUL_ZONE_ID),
            payload
    );
  }
}
