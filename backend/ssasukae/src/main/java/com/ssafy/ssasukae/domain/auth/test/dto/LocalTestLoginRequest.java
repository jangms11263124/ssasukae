package com.ssafy.ssasukae.domain.auth.test.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record LocalTestLoginRequest(
        @NotBlank
        @Pattern(regexp = "[A-Za-z0-9_-]{3,20}")
        String loginId,
        @NotBlank
        @Size(min = 4, max = 40)
        String password
) {
}
