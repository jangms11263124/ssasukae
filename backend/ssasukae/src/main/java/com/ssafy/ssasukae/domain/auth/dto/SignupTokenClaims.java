package com.ssafy.ssasukae.domain.auth.dto;

import com.ssafy.ssasukae.domain.user.type.OAuthProvider;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class SignupTokenClaims {

    private OAuthProvider provider;
    private String providerId;
    private String email;
    private String nickname;
    private String profileImageUrl;
}
