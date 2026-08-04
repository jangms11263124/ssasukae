package com.ssafy.ssasukae.domain.auth.test.controller;

import com.ssafy.ssasukae.domain.auth.dto.AuthTokenResponse;
import com.ssafy.ssasukae.domain.auth.test.dto.LocalTestLoginRequest;
import com.ssafy.ssasukae.domain.auth.test.dto.LocalTestSignupRequest;
import com.ssafy.ssasukae.domain.auth.test.service.LocalTestAuthService;
import com.ssafy.ssasukae.global.security.cookie.RefreshTokenCookieProvider;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("local")
@RequiredArgsConstructor
@RequestMapping("/api/auth/test")
public class LocalTestAuthController {

    private final LocalTestAuthService localTestAuthService;
    private final RefreshTokenCookieProvider refreshTokenCookieProvider;

    @PostMapping("/signup")
    public ResponseEntity<AuthTokenResponse> signup(
            @Valid @RequestBody LocalTestSignupRequest request,
            HttpServletResponse response
    ) {
        AuthTokenResponse tokenResponse = localTestAuthService.signup(request);
        refreshTokenCookieProvider.addRefreshTokenCookie(response, tokenResponse.getRefreshToken());
        return ResponseEntity.ok(tokenResponse);
    }

    @PostMapping("/login")
    public ResponseEntity<AuthTokenResponse> login(
            @Valid @RequestBody LocalTestLoginRequest request,
            HttpServletResponse response
    ) {
        AuthTokenResponse tokenResponse = localTestAuthService.login(request);
        refreshTokenCookieProvider.addRefreshTokenCookie(response, tokenResponse.getRefreshToken());
        return ResponseEntity.ok(tokenResponse);
    }
}
