package com.ssafy.ssasukae.domain.realtime.event;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.Objects;

public record RealtimeEvent<T>(
        Long eventId,
        RealtimeEventType type,
        Long roomId,
        @JsonInclude(JsonInclude.Include.NON_NULL) Long version,
        Instant occurredAt,
        T data) {

  public RealtimeEvent {
    if (eventId == null || eventId <= 0) {
      throw new IllegalArgumentException("eventId는 양수여야 합니다.");
    }
    if (roomId == null || roomId <= 0) {
      throw new IllegalArgumentException("roomId는 양수여야 합니다.");
    }
    if (version != null && version <= 0) {
      throw new IllegalArgumentException("version은 존재하는 경우 양수여야 합니다.");
    }

    Objects.requireNonNull(type, "type은 필수입니다.");
    Objects.requireNonNull(occurredAt, "occurredAt은 필수입니다.");
    Objects.requireNonNull(data, "data는 필수입니다.");
  }
}
