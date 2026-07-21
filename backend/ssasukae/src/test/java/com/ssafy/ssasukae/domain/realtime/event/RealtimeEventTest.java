package com.ssafy.ssasukae.domain.realtime.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RealtimeEventTest {

  private static final Instant OCCURRED_AT =
          Instant.parse("2026-07-21T01:30:00Z");

  private static final Clock FIXED_CLOCK =
          Clock.fixed(OCCURRED_AT, ZoneOffset.UTC);

  private static final long FIRST_EVENT_ID =
          OCCURRED_AT.toEpochMilli() + 1;

  private static final long ROOM_ID = 1001L;
  private static final long VERSION = 18L;

  private RealtimeEventFactory factory;

  @BeforeEach
  void setUp() {
    factory = new RealtimeEventFactory(FIXED_CLOCK);
  }

  @Test
  void createsEventWithCommonEnvelope() {
    Map<String, Object> data = Map.of("participantId", 10L);

    RealtimeEvent<Map<String, Object>> event =
            factory.create(
                    RealtimeEventType.PARTICIPANT_JOINED,
                    ROOM_ID,
                    VERSION,
                    data);

    assertThat(event.eventId()).isEqualTo(FIRST_EVENT_ID);
    assertThat(event.type())
            .isEqualTo(RealtimeEventType.PARTICIPANT_JOINED);
    assertThat(event.roomId()).isEqualTo(ROOM_ID);
    assertThat(event.version()).isEqualTo(VERSION);
    assertThat(event.occurredAt()).isEqualTo(OCCURRED_AT);
    assertThat(event.data()).isEqualTo(data);
  }

  @Test
  void createsEventWithoutVersion() {
    Map<String, Object> data = Map.of("progress", 72);

    RealtimeEvent<Map<String, Object>> event =
            factory.create(
                    RealtimeEventType.SCORING_PROGRESS_UPDATED,
                    ROOM_ID,
                    null,
                    data);

    assertThat(event.eventId()).isEqualTo(FIRST_EVENT_ID);
    assertThat(event.type())
            .isEqualTo(RealtimeEventType.SCORING_PROGRESS_UPDATED);
    assertThat(event.roomId()).isEqualTo(ROOM_ID);
    assertThat(event.version()).isNull();
    assertThat(event.occurredAt()).isEqualTo(OCCURRED_AT);
    assertThat(event.data()).containsEntry("progress", 72);
  }

  @Test
  void generatesIncreasingEventIds() {
    Map<String, Object> data = Map.of();

    RealtimeEvent<Map<String, Object>> firstEvent =
            factory.create(
                    RealtimeEventType.PARTICIPANT_JOINED,
                    ROOM_ID,
                    VERSION,
                    data);

    RealtimeEvent<Map<String, Object>> secondEvent =
            factory.create(
                    RealtimeEventType.PARTICIPANT_LEFT,
                    ROOM_ID,
                    VERSION + 1,
                    data);

    assertThat(firstEvent.eventId()).isEqualTo(FIRST_EVENT_ID);
    assertThat(secondEvent.eventId())
            .isEqualTo(firstEvent.eventId() + 1);
  }

  @Test
  void rejectsNullEventId() {
    Map<String, Object> data = Map.of();

    assertThatThrownBy(
            () ->
                    new RealtimeEvent<>(
                            null,
                            RealtimeEventType.PARTICIPANT_JOINED,
                            ROOM_ID,
                            VERSION,
                            OCCURRED_AT,
                            data))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("eventId");
  }

  @Test
  void rejectsNonPositiveEventId() {
    Map<String, Object> data = Map.of();

    assertThatThrownBy(
            () ->
                    new RealtimeEvent<>(
                            0L,
                            RealtimeEventType.PARTICIPANT_JOINED,
                            ROOM_ID,
                            VERSION,
                            OCCURRED_AT,
                            data))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("eventId");
  }

  @Test
  void rejectsNullRoomId() {
    Map<String, Object> data = Map.of();

    assertThatThrownBy(
            () ->
                    new RealtimeEvent<>(
                            FIRST_EVENT_ID,
                            RealtimeEventType.PARTICIPANT_JOINED,
                            null,
                            VERSION,
                            OCCURRED_AT,
                            data))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("roomId");
  }

  @Test
  void rejectsNonPositiveRoomId() {
    Map<String, Object> data = Map.of();

    assertThatThrownBy(
            () ->
                    new RealtimeEvent<>(
                            FIRST_EVENT_ID,
                            RealtimeEventType.PARTICIPANT_JOINED,
                            0L,
                            VERSION,
                            OCCURRED_AT,
                            data))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("roomId");
  }

  @Test
  void rejectsNonPositiveVersion() {
    Map<String, Object> data = Map.of();

    assertThatThrownBy(
            () ->
                    new RealtimeEvent<>(
                            FIRST_EVENT_ID,
                            RealtimeEventType.PARTICIPANT_JOINED,
                            ROOM_ID,
                            0L,
                            OCCURRED_AT,
                            data))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("version");
  }

  @Test
  void rejectsNullEventType() {
    Map<String, Object> data = Map.of();

    assertThatThrownBy(
            () ->
                    new RealtimeEvent<>(
                            FIRST_EVENT_ID,
                            null,
                            ROOM_ID,
                            VERSION,
                            OCCURRED_AT,
                            data))
            .isInstanceOf(NullPointerException.class)
            .hasMessageContaining("type");
  }

  @Test
  void rejectsNullOccurredAt() {
    Map<String, Object> data = Map.of();

    assertThatThrownBy(
            () ->
                    new RealtimeEvent<>(
                            FIRST_EVENT_ID,
                            RealtimeEventType.PARTICIPANT_JOINED,
                            ROOM_ID,
                            VERSION,
                            null,
                            data))
            .isInstanceOf(NullPointerException.class)
            .hasMessageContaining("occurredAt");
  }

  @Test
  void rejectsNullData() {
    assertThatThrownBy(
            () ->
                    new RealtimeEvent<Map<String, Object>>(
                            FIRST_EVENT_ID,
                            RealtimeEventType.PARTICIPANT_JOINED,
                            ROOM_ID,
                            VERSION,
                            OCCURRED_AT,
                            null))
            .isInstanceOf(NullPointerException.class)
            .hasMessageContaining("data");
  }
}