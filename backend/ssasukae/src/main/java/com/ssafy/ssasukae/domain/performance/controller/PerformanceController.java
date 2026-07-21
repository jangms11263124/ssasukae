package com.ssafy.ssasukae.domain.performance.controller;

import com.ssafy.ssasukae.domain.performance.dto.PerformanceSettingsResponse;
import com.ssafy.ssasukae.domain.performance.service.PerformanceService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/rooms/{roomId}/performances")
public class PerformanceController {

  private final PerformanceService performanceService;

  public PerformanceController(PerformanceService performanceService) {
    this.performanceService = performanceService;
  }

  @GetMapping("/{performanceId}/settings")
  public ResponseEntity<PerformanceSettingsResponse> getPerformanceSettings(
      @PathVariable Long roomId,
      @PathVariable Long performanceId,
      @AuthenticationPrincipal AuthenticatedUser user) {
    return ResponseEntity.ok(
        performanceService.getPerformanceSettings(roomId, performanceId, user.userId()));
  }
}
