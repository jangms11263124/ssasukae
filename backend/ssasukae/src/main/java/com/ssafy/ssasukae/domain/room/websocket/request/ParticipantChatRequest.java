package com.ssafy.ssasukae.domain.room.websocket.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ParticipantChatRequest(
        @NotBlank(message = "message는 필수입니다.")
        @Size(max = 300, message = "message는 300자 이하여야 합니다.")
        String message) {}
