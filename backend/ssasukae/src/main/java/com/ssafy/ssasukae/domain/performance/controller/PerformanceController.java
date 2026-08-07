package com.ssafy.ssasukae.domain.performance.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ssafy.ssasukae.domain.performance.service.PerformanceRecoveryService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/performances")
public class PerformanceController {

  private final PerformanceRecoveryService performanceRecoveryService;

  @PostMapping("/{performanceId}/analysis-failure")
  public ResponseEntity<Void> reportAnalysisFailure(
      @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
      @PathVariable Long performanceId) {
    performanceRecoveryService.reportAnalysisFailure(authenticatedUser.userId(), performanceId);
    return ResponseEntity.noContent().build();
  }
}
