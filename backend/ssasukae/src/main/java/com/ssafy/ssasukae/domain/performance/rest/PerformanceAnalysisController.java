package com.ssafy.ssasukae.domain.performance.rest;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ssafy.ssasukae.domain.performance.rest.request.AiAnalysisFailureRequest;
import com.ssafy.ssasukae.domain.performance.rest.request.AiAnalysisSuccessRequest;
import com.ssafy.ssasukae.domain.performance.service.PerformanceAnalysisService;
import com.ssafy.ssasukae.integration.ai.AiServerAuthenticator;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/internal/api/v1/performances")
@RequiredArgsConstructor
public class PerformanceAnalysisController {

  public static final String AI_API_KEY_HEADER = "X-AI-API-Key";

  private final AiServerAuthenticator aiServerAuthenticator;
  private final PerformanceAnalysisService performanceAnalysisService;

  // AI쪽에서 스코어링 성공했을 경우에 요청하는 경로
  @PostMapping("/{performanceId}/analysis-success")
  public ResponseEntity<Void> reportAnalysisSuccess(
      @PathVariable Long performanceId,
      @RequestHeader(value = AI_API_KEY_HEADER, required = false) String apiKey,
      @Valid @RequestBody AiAnalysisSuccessRequest request) {
    aiServerAuthenticator.authenticate(apiKey);
    performanceAnalysisService.completeAnalysis(performanceId, request);
    return ResponseEntity.noContent().build();
  }

  // AI쪽에서 스코어링 실패했을 경우에 요청하는 경로
  @PostMapping("/{performanceId}/analysis-failure")
  public ResponseEntity<Void> reportAnalysisFailure(
      @PathVariable Long performanceId,
      @RequestHeader(value = AI_API_KEY_HEADER, required = false) String apiKey,
      @Valid @RequestBody AiAnalysisFailureRequest request) {
    aiServerAuthenticator.authenticate(apiKey);
    performanceAnalysisService.failAnalysis(performanceId, request);
    return ResponseEntity.noContent().build();
  }
}
