package com.ssafy.ssasukae.global.websocket.ping;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.time.OffsetDateTime;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.annotation.SendToUser;

import com.ssafy.ssasukae.global.websocket.destination.WebSocketDestinations;
import com.ssafy.ssasukae.global.websocket.message.WebSocketEvent;

class PingWebSocketControllerTest {

  private final PingWebSocketController controller = new PingWebSocketController();

  @Test
  void returnsPongToPersonalQueue() throws NoSuchMethodException {
    OffsetDateTime clientSentAt = OffsetDateTime.parse("2026-07-23T20:00:00.000+09:00");
    OffsetDateTime before = OffsetDateTime.now();

    WebSocketEvent<PongPayload> event = controller.ping(new PingRequest(clientSentAt));

    assertThat(event.eventType()).isEqualTo("PONG");
    assertThat(event.roomId()).isNull();
    assertThat(event.payload().clientSentAt()).isEqualTo(clientSentAt);
    assertThat(event.payload().serverReceivedAt().toInstant()).isAfterOrEqualTo(before.toInstant());

    Method pingMethod = PingWebSocketController.class.getMethod("ping", PingRequest.class);
    assertThat(pingMethod.getAnnotation(MessageMapping.class).value()).containsExactly("/ping");
    SendToUser sendToUser = pingMethod.getAnnotation(SendToUser.class);
    assertThat(sendToUser.destinations())
        .containsExactly(WebSocketDestinations.USER_PONG_QUEUE);
    assertThat(sendToUser.broadcast()).isFalse();
  }

  @Test
  void rejectsMissingClientSentAt() {
    try (var validatorFactory = Validation.buildDefaultValidatorFactory()) {
      Validator validator = validatorFactory.getValidator();

      assertThat(validator.validate(new PingRequest(null)))
          .singleElement()
          .satisfies(
              violation -> {
                assertThat(violation.getPropertyPath().toString()).isEqualTo("clientSentAt");
                assertThat(violation.getMessage()).isEqualTo("clientSentAt은 필수입니다.");
              });
    }
  }
}
