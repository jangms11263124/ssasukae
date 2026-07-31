package com.ssafy.ssasukae.domain.room.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record RoomPerformerSelectRequest(
        @NotNull(message = "participantId는 필수입니다.")
        @Positive(message = "participantId는 양의 정수여야 합니다.")
        Long participantId) {}
