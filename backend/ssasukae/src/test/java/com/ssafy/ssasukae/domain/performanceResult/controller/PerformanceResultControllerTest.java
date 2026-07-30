package com.ssafy.ssasukae.domain.performanceResult.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultRequestDTO;
import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultResponseDTO;
import com.ssafy.ssasukae.domain.performanceResult.service.PerformanceResultService;
import com.ssafy.ssasukae.integration.ai.AiServerAuthenticator;

@ExtendWith(MockitoExtension.class)
class PerformanceResultControllerTest {

  private static final Long PERFORMANCE_ID = 30L;
  private static final Long RESULT_ID = 40L;
  private static final String API_KEY = "test-ai-api-key";

  @Mock private AiServerAuthenticator aiServerAuthenticator;
  @Mock private PerformanceResultService performanceResultService;

  private PerformanceResultController controller;

  @BeforeEach
  void setUp() {
    controller = new PerformanceResultController(aiServerAuthenticator, performanceResultService);
  }

  @Test
  @DisplayName("AI 서버 인증 후 공연 결과 처리를 호출한다")
  void getScoreAuthenticatesBeforeProcessing() {
    PerformanceResultRequestDTO.ScoreDTO request =
        PerformanceResultRequestDTO.ScoreDTO.builder()
            .songId(20L)
            .userId(1L)
            .pitchScore(90)
            .rhythmScore(91)
            .lyricsScore(92)
            .finalScore(93)
            .build();
    PerformanceResultResponseDTO.PerformanceIdDTO result =
        PerformanceResultResponseDTO.PerformanceIdDTO.builder().performanceId(RESULT_ID).build();
    when(performanceResultService.getScore(PERFORMANCE_ID, request)).thenReturn(result);

    ResponseEntity<PerformanceResultResponseDTO.PerformanceIdDTO> response =
        controller.getScore(PERFORMANCE_ID, API_KEY, request);

    InOrder order = inOrder(aiServerAuthenticator, performanceResultService);
    order.verify(aiServerAuthenticator).authenticate(API_KEY);
    order.verify(performanceResultService).getScore(PERFORMANCE_ID, request);
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isSameAs(result);
  }
}
