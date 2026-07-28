package com.ssafy.ssasukae.domain.performance.rest.request;

import jakarta.validation.constraints.Size;

public record AiAnalysisFailureRequest(
        // AI 서버가 점수 제공에 실패할 시 Spring 서버로 보내주는 text
        @Size(max = 1000)
        String reason) {}
