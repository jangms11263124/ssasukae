package com.ssafy.ssasukae.domain.realtime.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

class SequentialRealtimeEventIdGeneratorTest {

  @Test
  void generatesPositiveIncreasingIds() {
    Instant initialTime = Instant.parse("2026-07-21T04:00:00Z");
    Clock fixedClock = Clock.fixed(initialTime, ZoneOffset.UTC);
    SequentialRealtimeEventIdGenerator generator =
        new SequentialRealtimeEventIdGenerator(fixedClock);

    long firstId = generator.nextId();
    long secondId = generator.nextId();

    assertThat(firstId).isEqualTo(initialTime.toEpochMilli() + 1);
    assertThat(secondId).isEqualTo(firstId + 1);
  }
}
