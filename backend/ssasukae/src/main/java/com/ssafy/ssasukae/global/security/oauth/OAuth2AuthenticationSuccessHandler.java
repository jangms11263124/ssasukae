package com.ssafy.ssasukae.global.security.oauth;

import com.ssafy.ssasukae.domain.auth.dto.OAuthLoginResult;
import com.ssafy.ssasukae.global.security.cookie.RefreshTokenCookieProvider;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;
import com.ssafy.ssasukae.global.security.oauth.principal.CustomOAuth2User;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class OAuth2AuthenticationSuccessHandler implements AuthenticationSuccessHandler {

    private final JwtTokenProvider jwtTokenProvider;
    private final RefreshTokenCookieProvider refreshTokenCookieProvider;
    private final OAuth2Properties oAuth2Properties;

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication
    ) throws IOException, ServletException {

        CustomOAuth2User oAuth2User = (CustomOAuth2User) authentication.getPrincipal();

        if (!oAuth2User.isRegistered()) {
            OAuthLoginResult result = oAuth2User.getLoginResult();

            String signupToken = jwtTokenProvider.createSignupToken(
                    result.getProvider(),
                    result.getProviderId(),
                    result.getEmail(),
                    result.getNickname(),
                    result.getProfileImageUrl()
            );

            String redirectUrl = UriComponentsBuilder
                    .fromUriString(oAuth2Properties.getSignupRedirectUri())
                    .queryParam("signupToken", signupToken)
                    .build()
                    .toUriString();

            response.sendRedirect(redirectUrl);
            return;
        }

        String accessToken = jwtTokenProvider.createAccessToken(
                oAuth2User.getUserId(),
                oAuth2User.getEmail(),
                oAuth2User.getRole()
        );

        String refreshToken = jwtTokenProvider.createRefreshToken(oAuth2User.getUserId());

        refreshTokenCookieProvider.addRefreshTokenCookie(response, refreshToken);

        String redirectUrl = UriComponentsBuilder
                .fromUriString(oAuth2Properties.getRedirectUri())
                .queryParam("accessToken", accessToken)
                .build()
                .toUriString();

        response.sendRedirect(redirectUrl);
    }
}
