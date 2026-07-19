package com.ssafy.ssasukae.domain.auth.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.ssafy.ssasukae.domain.user.dto.UserResponse;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class AuthTokenResponse {

    private String accessToken;

    @JsonIgnore
    private String refreshToken;

    private UserResponse user;
}
