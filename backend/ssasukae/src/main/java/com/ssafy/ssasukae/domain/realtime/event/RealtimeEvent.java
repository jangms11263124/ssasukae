package com.ssafy.ssasukae.domain.realtime.event;

import java.time.Instant;
import java.util.Objects;

public record RealtimeEvent<T>(
    Long eventId, RealtimeEventType type, Instant occurredAt, T data) {

  public RealtimeEvent {
    if (eventId == null || eventId <= 0) {
      throw new IllegalArgumentException("eventId는 양수여야 합니다.");
    }
    Objects.requireNonNull(type, "type은 필수입니다.");
    Objects.requireNonNull(occurredAt, "occurredAt은 필수입니다.");
    Objects.requireNonNull(data, "data는 필수입니다.");
  }
}
