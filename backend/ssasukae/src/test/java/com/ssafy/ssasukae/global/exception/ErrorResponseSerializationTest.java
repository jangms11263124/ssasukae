package com.ssafy.ssasukae.global.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.global.exception.restapi.ErrorResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.json.JsonTest;
import org.springframework.boot.test.json.JacksonTester;

@JsonTest
class ErrorResponseSerializationTest {

  @Autowired private JacksonTester<ErrorResponse> json;

  @Test
  void serializesExistingErrorContract() throws Exception {
    var timestamp = LocalDateTime.of(2026, 7, 20, 12, 0);
    var response = new ErrorResponse(400, "잘못된 요청입니다.", timestamp);

    assertThat(json.write(response)).extractingJsonPathNumberValue("@.status").isEqualTo(400);
    assertThat(json.write(response))
        .extractingJsonPathStringValue("@.message")
        .isEqualTo("잘못된 요청입니다.");
    assertThat(json.write(response))
        .extractingJsonPathStringValue("@.timestamp")
        .isEqualTo("2026-07-20T12:00:00");
  }
}
