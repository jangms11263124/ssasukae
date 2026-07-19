package com.ssafy.ssasukae.global.security.oauth;

import com.ssafy.ssasukae.domain.auth.dto.OAuthLoginResult;
import com.ssafy.ssasukae.domain.auth.service.AuthService;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.global.security.oauth.principal.CustomOAuth2User;
import com.ssafy.ssasukae.global.security.oauth.userinfo.OAuth2UserInfo;
import com.ssafy.ssasukae.global.security.oauth.userinfo.OAuth2UserInfoFactory;

import lombok.RequiredArgsConstructor;

import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

    private final AuthService authService;

    @Override
    public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
        OAuth2User oAuth2User = super.loadUser(userRequest);

        OAuthProvider provider = getProvider(userRequest);
        OAuth2UserInfo userInfo = OAuth2UserInfoFactory.getOAuth2UserInfo(provider, oAuth2User.getAttributes());

        OAuthLoginResult loginResult = authService.processOAuthLogin(provider, userInfo);

        return new CustomOAuth2User(loginResult, oAuth2User.getAttributes());
    }

    private OAuthProvider getProvider(OAuth2UserRequest userRequest) {
        String registrationId = userRequest.getClientRegistration().getRegistrationId();
        return OAuthProvider.valueOf(registrationId.toUpperCase());
    }
}
