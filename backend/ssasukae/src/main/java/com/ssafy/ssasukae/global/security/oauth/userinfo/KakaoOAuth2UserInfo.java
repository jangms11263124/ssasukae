package com.ssafy.ssasukae.global.security.oauth.userinfo;

import lombok.RequiredArgsConstructor;

import java.util.Map;

@RequiredArgsConstructor
public class KakaoOAuth2UserInfo implements OAuth2UserInfo {

    private final Map<String, Object> attributes;

    @Override
    public String getProviderId() {
        return String.valueOf(attributes.get("id"));
    }

    @Override
    public String getEmail() {
        return (String) getKakaoAccount().get("email");
    }

    @Override
    public String getNickname() {
        return (String) getProfile().get("nickname");
    }

    @Override
    public String getProfileImageUrl() {
        return (String) getProfile().get("profile_image_url");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getKakaoAccount() {
        return (Map<String, Object>) attributes.getOrDefault("kakao_account", Map.of());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getProfile() {
        return (Map<String, Object>) getKakaoAccount().getOrDefault("profile", Map.of());
    }
}
