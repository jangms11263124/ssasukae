package com.ssafy.ssasukae.domain.performance.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record StartPerformanceRequest(
    @NotNull @Positive Long performerParticipantId,
    @NotNull @Positive Long songId) {}
