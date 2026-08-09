package com.ssafy.ssasukae.domain.performance.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ssafy.ssasukae.domain.performance.service.PerformanceDemoService;
import com.ssafy.ssasukae.domain.performance.service.PerformanceRecoveryService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/performances")
public class PerformanceController {

  private final PerformanceRecoveryService performanceRecoveryService;
  private final PerformanceDemoService performanceDemoService;

  @PostMapping("/{performanceId}/analysis-failure")
  public ResponseEntity<Void> reportAnalysisFailure(
      @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
      @PathVariable Long performanceId) {
    performanceRecoveryService.reportAnalysisFailure(authenticatedUser.userId(), performanceId);
    return ResponseEntity.noContent().build();
  }

  /** 시연용: AI 대신 88~100점을 즉시 반영한다. 가창자만 호출 가능. */
  @PostMapping("/{performanceId}/demo-score")
  public ResponseEntity<Void> submitDemoScore(
      @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
      @PathVariable Long performanceId) {
    performanceDemoService.submitDemoScore(authenticatedUser.userId(), performanceId);
    return ResponseEntity.noContent().build();
  }
}
