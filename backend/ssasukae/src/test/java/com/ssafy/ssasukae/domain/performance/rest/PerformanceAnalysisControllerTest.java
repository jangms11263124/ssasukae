package com.ssafy.ssasukae.domain.performance.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.inOrder;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.ssafy.ssasukae.domain.performance.rest.request.AiAnalysisFailureRequest;
import com.ssafy.ssasukae.domain.performance.rest.request.AiAnalysisSuccessRequest;
import com.ssafy.ssasukae.domain.performance.service.PerformanceAnalysisService;
import com.ssafy.ssasukae.integration.ai.AiServerAuthenticator;

@ExtendWith(MockitoExtension.class)
class PerformanceAnalysisControllerTest {

  private static final Long PERFORMANCE_ID = 30L;
  private static final String API_KEY = "test-ai-api-key";

  @Mock private AiServerAuthenticator aiServerAuthenticator;
  @Mock private PerformanceAnalysisService performanceAnalysisService;

  private PerformanceAnalysisController controller;

  @BeforeEach
  void setUp() {
    controller =
        new PerformanceAnalysisController(aiServerAuthenticator, performanceAnalysisService);
  }

  @Test
  @DisplayName("AI 서버 인증 후 최종 점수 처리 서비스를 호출한다")
  void reportScoreResultAuthenticatesBeforeProcessing() {
    AiAnalysisSuccessRequest request =
        new AiAnalysisSuccessRequest(
            90,
            90,
            90,
            null,
            90);

    ResponseEntity<Void> response = controller.reportAnalysisSuccess(PERFORMANCE_ID, API_KEY, request);

    InOrder order = inOrder(aiServerAuthenticator, performanceAnalysisService);
    order.verify(aiServerAuthenticator).authenticate(API_KEY);
    order.verify(performanceAnalysisService).completeAnalysis(PERFORMANCE_ID, request);
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
  }

  @Test
  @DisplayName("AI 서버 인증 후 분석 실패 처리 서비스를 호출한다")
  void reportAnalysisFailureAuthenticatesBeforeProcessing() {
    AiAnalysisFailureRequest request = new AiAnalysisFailureRequest("analysis failed");

    ResponseEntity<Void> response =
        controller.reportAnalysisFailure(PERFORMANCE_ID, API_KEY, request);

    InOrder order = inOrder(aiServerAuthenticator, performanceAnalysisService);
    order.verify(aiServerAuthenticator).authenticate(API_KEY);
    order.verify(performanceAnalysisService).failAnalysis(PERFORMANCE_ID, request);
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
  }
}
