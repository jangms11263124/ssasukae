package com.ssafy.ssasukae.global.security.oauth.userinfo;

public interface OAuth2UserInfo {

    String getProviderId();

    String getEmail();

    String getNickname();

    String getProfileImageUrl();
}
