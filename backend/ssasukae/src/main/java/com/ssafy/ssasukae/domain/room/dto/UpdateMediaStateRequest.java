package com.ssafy.ssasukae.domain.room.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateMediaStateRequest(
    @NotNull Boolean micEnabled,
    @NotNull Boolean cameraEnabled) {}
