package com.ssafy.ssasukae.domain.performanceResult.controller;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultRequestDTO;
import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultResponseDTO;
import com.ssafy.ssasukae.domain.performanceResult.service.PerformanceResultService;
import com.ssafy.ssasukae.integration.ai.AiServerAuthenticator;

import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
@RequestMapping("/internal/api/performance-result")
public class PerformanceResultController {

  public static final String AI_API_KEY_HEADER = "X-AI-API-Key";

  private final AiServerAuthenticator aiServerAuthenticator;
  private final PerformanceResultService performanceResultService;

  @PostMapping("/{performanceId}/result")
  public ResponseEntity<PerformanceResultResponseDTO.PerformanceIdDTO> getScore(
      @PathVariable Long performanceId,
      @RequestHeader(value = AI_API_KEY_HEADER, required = false) String apiKey,
      @Valid @RequestBody PerformanceResultRequestDTO.ScoreDTO request) {
    aiServerAuthenticator.authenticate(apiKey);
    PerformanceResultResponseDTO.PerformanceIdDTO data = performanceResultService.getScore(performanceId, request);
    return ResponseEntity.ok(data);
  }
}
