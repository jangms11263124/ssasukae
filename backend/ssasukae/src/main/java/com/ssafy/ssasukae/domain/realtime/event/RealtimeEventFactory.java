package com.ssafy.ssasukae.domain.realtime.event;

import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.stereotype.Component;

@Component
public class RealtimeEventFactory {

  private final Clock clock;
  private final AtomicLong sequence;

  public RealtimeEventFactory(Clock clock) {
    this.clock = clock;
    this.sequence = new AtomicLong(clock.millis());
  }

  public <T> RealtimeEvent<T> create(
          RealtimeEventType type, Long roomId, Long version, T data) {
    return new RealtimeEvent<>(
            sequence.incrementAndGet(),
            type,
            roomId,
            version,
            Instant.now(clock),
            data);
  }
}
