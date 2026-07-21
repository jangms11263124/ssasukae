package com.ssafy.ssasukae.domain.realtime.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;

import org.junit.jupiter.api.Test;

class RealtimeEventTest {

  private static final Instant OCCURRED_AT = Instant.parse("2026-07-21T01:30:00Z");
  private static final Clock FIXED_CLOCK = Clock.fixed(OCCURRED_AT, ZoneOffset.UTC);
  private static final long EVENT_ID = 1009L;

  private final RealtimeEventFactory factory =
      new RealtimeEventFactory(FIXED_CLOCK, () -> EVENT_ID);

  @Test
  void createsEventWithCommonEnvelope() {
    Map<String, Object> data = Map.of("participantId", 10L);

    RealtimeEvent<Map<String, Object>> event =
        factory.create(RealtimeEventType.PARTICIPANT_JOINED, data);

    assertThat(event.eventId()).isEqualTo(EVENT_ID);
    assertThat(event.type()).isEqualTo(RealtimeEventType.PARTICIPANT_JOINED);
    assertThat(event.occurredAt()).isEqualTo(OCCURRED_AT);
    assertThat(event.data()).isEqualTo(data);
  }

  @Test
  void includesDomainIdentifiersOnlyInData() {
    Map<String, Object> data = Map.of("performanceId", 1006L, "status", "PLAYING");

    RealtimeEvent<Map<String, Object>> event =
        factory.create(RealtimeEventType.PERFORMANCE_STATE_CHANGED, data);

    assertThat(event.data()).containsEntry("performanceId", 1006L);
    assertThat(event.data()).containsEntry("status", "PLAYING");
  }

  @Test
  void rejectsInvalidEnvelopeFields() {
    Map<String, Object> data = Map.of();

    assertThatThrownBy(
            () -> new RealtimeEvent<>(0L, RealtimeEventType.PARTICIPANT_JOINED, OCCURRED_AT, data))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("eventId");
    assertThatThrownBy(
            () ->
                new RealtimeEvent<>(
                    EVENT_ID, RealtimeEventType.PARTICIPANT_JOINED, null, data))
        .isInstanceOf(NullPointerException.class)
        .hasMessageContaining("occurredAt");
    assertThatThrownBy(
            () ->
                new RealtimeEvent<Map<String, Object>>(
                    EVENT_ID, RealtimeEventType.PARTICIPANT_JOINED, OCCURRED_AT, null))
        .isInstanceOf(NullPointerException.class)
        .hasMessageContaining("data");
  }
}
