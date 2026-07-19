package com.ssafy.ssasukae.domain.auth.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class OAuthSignupRequest {

    private String signupToken;
    private String nickname;
    private String profileImageUrl;
}
