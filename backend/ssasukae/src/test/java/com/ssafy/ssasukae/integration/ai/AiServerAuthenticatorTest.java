package com.ssafy.ssasukae.integration.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.ssafy.ssasukae.global.exception.performanceAnalysis.PerformanceAnalysisErrorCode;
import com.ssafy.ssasukae.global.exception.CustomException;

class AiServerAuthenticatorTest {

  @Test
  @DisplayName("설정된 내부 API 키와 같은 키를 허용한다")
  void authenticateAcceptsMatchingKey() {
    AiServerAuthenticator authenticator = new AiServerAuthenticator("test-ai-api-key");

    assertThatCode(() -> authenticator.authenticate("test-ai-api-key")).doesNotThrowAnyException();
  }

  @Test
  @DisplayName("내부 API 키가 다르면 AI 서버 요청을 거부한다")
  void authenticateRejectsDifferentKey() {
    AiServerAuthenticator authenticator = new AiServerAuthenticator("test-ai-api-key");

    assertThatThrownBy(() -> authenticator.authenticate("wrong-key"))
        .isInstanceOfSatisfying(
            CustomException.class,
            exception ->
                assertThat(exception.getErrorCode())
                    .isEqualTo(PerformanceAnalysisErrorCode.UNAUTHORIZED_AI_SERVER));
  }

  @Test
  @DisplayName("서버에 내부 API 키가 설정되지 않았으면 모든 요청을 거부한다")
  void authenticateRejectsWhenServerKeyIsEmpty() {
    AiServerAuthenticator authenticator = new AiServerAuthenticator("");

    assertThatThrownBy(() -> authenticator.authenticate("any-key"))
        .isInstanceOf(CustomException.class);
  }
}
