package com.ssafy.ssasukae.domain.realtime.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.json.JsonTest;
import org.springframework.boot.test.json.JacksonTester;
import org.springframework.boot.test.json.JsonContent;

@JsonTest
class RealtimeEventJsonTest {

  @Autowired
  private JacksonTester<RealtimeEvent<TestData>> json;

  @Test
  void serializesStableEnvelopeContract() throws Exception {
    RealtimeEvent<TestData> event =
            new RealtimeEvent<>(
                    1009L,
                    RealtimeEventType.CHAT_MESSAGE,
                    1001L,
                    18L,
                    Instant.parse("2026-07-21T01:30:00Z"),
                    new TestData(
                            1010L,
                            "local-1742",
                            1003L,
                            "노래왕",
                            "안녕하세요!"));

    JsonContent<RealtimeEvent<TestData>> written = json.write(event);

    assertThat(written)
            .extractingJsonPathNumberValue("@.eventId")
            .isEqualTo(1009);

    assertThat(written)
            .extractingJsonPathStringValue("@.type")
            .isEqualTo("CHAT_MESSAGE");

    assertThat(written)
            .extractingJsonPathNumberValue("@.roomId")
            .isEqualTo(1001);

    assertThat(written)
            .extractingJsonPathNumberValue("@.version")
            .isEqualTo(18);

    assertThat(written)
            .extractingJsonPathStringValue("@.occurredAt")
            .isEqualTo("2026-07-21T01:30:00Z");

    assertThat(written)
            .extractingJsonPathNumberValue("@.data.messageId")
            .isEqualTo(1010);

    assertThat(written)
            .extractingJsonPathStringValue("@.data.clientMessageId")
            .isEqualTo("local-1742");

    assertThat(written)
            .extractingJsonPathNumberValue("@.data.senderParticipantId")
            .isEqualTo(1003);

    assertThat(written)
            .extractingJsonPathStringValue("@.data.senderNickname")
            .isEqualTo("노래왕");

    assertThat(written)
            .extractingJsonPathStringValue("@.data.message")
            .isEqualTo("안녕하세요!");

    assertThat(written).doesNotHaveJsonPath("@.performanceId");
  }

  @Test
  void omitsVersionWhenVersionIsNull() throws Exception {
    RealtimeEvent<TestData> event =
            new RealtimeEvent<>(
                    1009L,
                    RealtimeEventType.CHAT_MESSAGE,
                    1001L,
                    null,
                    Instant.parse("2026-07-21T01:30:00Z"),
                    new TestData(
                            1010L,
                            "local-1742",
                            1003L,
                            "노래왕",
                            "안녕하세요!"));

    JsonContent<RealtimeEvent<TestData>> written = json.write(event);

    assertThat(written).doesNotHaveJsonPath("@.version");
  }

  private record TestData(
          Long messageId,
          String clientMessageId,
          Long senderParticipantId,
          String senderNickname,
          String message) {}
}