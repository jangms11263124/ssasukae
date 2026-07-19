package com.ssafy.ssasukae.domain.auth.dto;

import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.global.security.oauth.userinfo.OAuth2UserInfo;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class OAuthLoginResult {

    private boolean registered;
    private User user;

    private OAuthProvider provider;
    private String providerId;
    private String email;
    private String nickname;
    private String profileImageUrl;

    public static OAuthLoginResult registered(User user) {
        return OAuthLoginResult.builder()
                .registered(true)
                .user(user)
                .build();
    }

    public static OAuthLoginResult unregistered(
            OAuthProvider provider,
            OAuth2UserInfo userInfo
    ) {
        return OAuthLoginResult.builder()
                .registered(false)
                .provider(provider)
                .providerId(userInfo.getProviderId())
                .email(userInfo.getEmail())
                .nickname(userInfo.getNickname())
                .profileImageUrl(userInfo.getProfileImageUrl())
                .build();
    }
}