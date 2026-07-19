package com.ssafy.ssasukae.domain.auth.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class TokenReissueResponse {

    private String accessToken;

    @JsonIgnore
    private String refreshToken;
}
