package com.ssafy.ssasukae.domain.performanceResult.controller;

import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultRequestDTO;
import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultResponseDTO;
import com.ssafy.ssasukae.domain.performanceResult.service.PerformanceResultService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/internal/api/performance-result")
public class PerformanceResultController {

    private final PerformanceResultService performanceResultService;

    @PostMapping()
    public ResponseEntity<PerformanceResultResponseDTO.PerformanceIdDTO> getScore(@RequestBody PerformanceResultRequestDTO.ScoreDTO request) {
        PerformanceResultResponseDTO.PerformanceIdDTO data = performanceResultService.getScore(request);
        return ResponseEntity.ok(data);
    }
}
