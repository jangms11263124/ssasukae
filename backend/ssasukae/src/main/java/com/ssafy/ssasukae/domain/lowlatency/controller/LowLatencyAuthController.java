package com.ssafy.ssasukae.domain.lowlatency.controller;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ssafy.ssasukae.domain.lowlatency.dto.LowLatencyTokenRefreshRequest;
import com.ssafy.ssasukae.domain.lowlatency.dto.LowLatencyTokenRefreshResponse;
import com.ssafy.ssasukae.domain.lowlatency.service.LowLatencyAppService;

import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/low-latency/auth")
public class LowLatencyAuthController {

  private final LowLatencyAppService lowLatencyAppService;

  @PostMapping("/refresh")
  public ResponseEntity<LowLatencyTokenRefreshResponse> refresh(
      @Valid @RequestBody LowLatencyTokenRefreshRequest request) {
    return ResponseEntity.ok(lowLatencyAppService.refresh(request.appRefreshToken()));
  }
}
