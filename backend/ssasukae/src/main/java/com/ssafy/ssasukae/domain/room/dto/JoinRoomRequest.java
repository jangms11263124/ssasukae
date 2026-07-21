package com.ssafy.ssasukae.domain.room.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record JoinRoomRequest(
    @NotBlank
        @Pattern(
            regexp = "^[A-Z0-9]{6}$",
            message = "초대 코드는 영문 대문자와 숫자로 이루어진 6자리여야 합니다.")
        String inviteCode) {}
