package com.ssafy.ssasukae.domain.realtime.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.json.JsonTest;
import org.springframework.boot.test.json.JacksonTester;

@JsonTest
class RealtimeEventJsonTest {

  @Autowired private JacksonTester<RealtimeEvent<TestData>> json;

  @Test
  void serializesStableEnvelopeContract() throws Exception {
    RealtimeEvent<TestData> event =
        new RealtimeEvent<>(
            1009L,
            RealtimeEventType.CHAT_MESSAGE,
            Instant.parse("2026-07-21T01:30:00Z"),
            new TestData(1010L, "local-1742", 1003L, "노래왕", "안녕하세요!"));

    assertThat(json.write(event)).extractingJsonPathNumberValue("@.eventId").isEqualTo(1009);
    assertThat(json.write(event))
        .extractingJsonPathStringValue("@.type")
        .isEqualTo("CHAT_MESSAGE");
    assertThat(json.write(event)).doesNotHaveJsonPath("@.roomId");
    assertThat(json.write(event)).doesNotHaveJsonPath("@.performanceId");
    assertThat(json.write(event))
        .extractingJsonPathStringValue("@.occurredAt")
        .isEqualTo("2026-07-21T01:30:00Z");
    assertThat(json.write(event)).extractingJsonPathNumberValue("@.data.messageId").isEqualTo(1010);
    assertThat(json.write(event))
        .extractingJsonPathStringValue("@.data.clientMessageId")
        .isEqualTo("local-1742");
    assertThat(json.write(event))
        .extractingJsonPathStringValue("@.data.message")
        .isEqualTo("안녕하세요!");
  }

  private record TestData(
      Long messageId,
      String clientMessageId,
      Long senderParticipantId,
      String senderNickname,
      String message) {}
}
