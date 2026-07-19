package com.ssafy.ssasukae.global.security.oauth.userinfo;

import com.ssafy.ssasukae.domain.user.type.OAuthProvider;

import java.util.Map;

public class OAuth2UserInfoFactory {

    public static OAuth2UserInfo getOAuth2UserInfo(
            OAuthProvider provider,
            Map<String, Object> attributes
    ) {
        return switch (provider) {
            case GOOGLE -> new GoogleOAuth2UserInfo(attributes);
        };
    }
}