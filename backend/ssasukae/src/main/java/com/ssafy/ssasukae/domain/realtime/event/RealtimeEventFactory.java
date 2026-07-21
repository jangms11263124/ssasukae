package com.ssafy.ssasukae.domain.realtime.event;

import java.time.Clock;
import java.time.Instant;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class RealtimeEventFactory {

  private final Clock clock;
  private final RealtimeEventIdGenerator eventIdGenerator;

  public <T> RealtimeEvent<T> create(RealtimeEventType type, T data) {
    return new RealtimeEvent<>(eventIdGenerator.nextId(), type, Instant.now(clock), data);
  }
}
