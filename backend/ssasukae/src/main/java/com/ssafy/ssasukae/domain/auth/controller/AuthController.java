package com.ssafy.ssasukae.domain.auth.controller;

import com.ssafy.ssasukae.domain.auth.dto.AuthTokenResponse;
import com.ssafy.ssasukae.domain.auth.dto.OAuthSignupRequest;
import com.ssafy.ssasukae.domain.auth.dto.TokenReissueResponse;
import com.ssafy.ssasukae.domain.auth.service.AuthService;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.auth.AuthErrorCode;
import com.ssafy.ssasukae.global.security.cookie.RefreshTokenCookieProvider;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/auth")
public class AuthController {

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final AuthService authService;
    private final RefreshTokenCookieProvider refreshTokenCookieProvider;

    @PostMapping("/signup")
    public ResponseEntity<AuthTokenResponse> signup(
            @RequestBody OAuthSignupRequest request,
            HttpServletResponse response
    ) {
        AuthTokenResponse tokenResponse = authService.completeSignup(request);
        refreshTokenCookieProvider.addRefreshTokenCookie(response, tokenResponse.getRefreshToken());
        return ResponseEntity.ok(tokenResponse);
    }

    @PostMapping("/refresh")
    public ResponseEntity<TokenReissueResponse> refresh(
            @CookieValue(value = RefreshTokenCookieProvider.REFRESH_TOKEN_COOKIE_NAME, required = false) String refreshToken,
            HttpServletResponse response
    ) {
        if (!StringUtils.hasText(refreshToken)) {
            throw new CustomException(AuthErrorCode.REFRESH_TOKEN_REQUIRED);
        }

        try {
            TokenReissueResponse tokenResponse = authService.reissueToken(refreshToken);
            refreshTokenCookieProvider.addRefreshTokenCookie(response, tokenResponse.getRefreshToken());
            return ResponseEntity.ok(tokenResponse);
        } catch (RuntimeException e) {
            // 다른 기기 로그인 등으로 세션이 무효화된 refresh는 쿠키를 제거해 반복 실패를 막는다.
            refreshTokenCookieProvider.deleteRefreshTokenCookie(response);
            throw e;
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            HttpServletRequest request,
            @CookieValue(value = RefreshTokenCookieProvider.REFRESH_TOKEN_COOKIE_NAME, required = false) String refreshToken,
            HttpServletResponse response
    ) {
        authService.logout(resolveAccessToken(request), refreshToken);
        refreshTokenCookieProvider.deleteRefreshTokenCookie(response);
        return ResponseEntity.noContent().build();
    }

    private String resolveAccessToken(HttpServletRequest request) {
        String bearerToken = request.getHeader(AUTHORIZATION_HEADER);

        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith(BEARER_PREFIX)) {
            return bearerToken.substring(BEARER_PREFIX.length());
        }

        return null;
    }
}
