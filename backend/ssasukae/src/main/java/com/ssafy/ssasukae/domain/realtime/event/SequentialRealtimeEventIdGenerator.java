package com.ssafy.ssasukae.domain.realtime.event;

import java.time.Clock;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.stereotype.Component;

@Component
public class SequentialRealtimeEventIdGenerator implements RealtimeEventIdGenerator {

  private final AtomicLong sequence;

  public SequentialRealtimeEventIdGenerator(Clock clock) {
    sequence = new AtomicLong(clock.millis());
  }

  @Override
  public long nextId() {
    return sequence.incrementAndGet();
  }
}
