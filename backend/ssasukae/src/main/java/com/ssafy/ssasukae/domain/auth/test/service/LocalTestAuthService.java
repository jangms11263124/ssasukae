package com.ssafy.ssasukae.domain.auth.test.service;

import com.ssafy.ssasukae.domain.auth.dto.AuthTokenResponse;
import com.ssafy.ssasukae.domain.auth.test.dto.LocalTestLoginRequest;
import com.ssafy.ssasukae.domain.auth.test.dto.LocalTestSignupRequest;
import com.ssafy.ssasukae.domain.user.dto.UserResponse;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.service.UserService;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.auth.AuthErrorCode;
import com.ssafy.ssasukae.global.exception.user.UserErrorCode;
import com.ssafy.ssasukae.global.security.jwt.ActiveSessionService;
import com.ssafy.ssasukae.global.security.jwt.JwtProperties;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;

import lombok.RequiredArgsConstructor;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;

@Service
@Profile("local")
@RequiredArgsConstructor
public class LocalTestAuthService {

    private static final OAuthProvider TEST_PROVIDER = OAuthProvider.GOOGLE;
    private static final String PROVIDER_ID_PREFIX = "local-test:";

    private final UserService userService;
    private final JwtTokenProvider jwtTokenProvider;
    private final ActiveSessionService activeSessionService;
    private final JwtProperties jwtProperties;

    @Transactional
    public AuthTokenResponse signup(LocalTestSignupRequest request) {
        String loginId = normalizeLoginId(request.loginId());
        String providerId = providerId(loginId, request.password());

        userService.findByProviderAndProviderId(TEST_PROVIDER, providerId)
                .ifPresent(user -> {
                    throw new CustomException(AuthErrorCode.ALREADY_REGISTERED);
                });

        String nickname = request.nickname().trim();
        if (!userService.isNicknameAvailable(nickname)) {
            throw new CustomException(UserErrorCode.NICKNAME_DUPLICATED);
        }

        User user = userService.createOAuthUser(
                TEST_PROVIDER,
                providerId,
                loginId + "@local-test.ssafystar.invalid",
                nickname,
                null
        );
        return issueTokens(user);
    }

    @Transactional(readOnly = true)
    public AuthTokenResponse login(LocalTestLoginRequest request) {
        String loginId = normalizeLoginId(request.loginId());
        User user = userService.findByProviderAndProviderId(
                        TEST_PROVIDER,
                        providerId(loginId, request.password())
                )
                .orElseThrow(() -> new CustomException(UserErrorCode.USER_NOT_FOUND));
        return issueTokens(user);
    }

    private AuthTokenResponse issueTokens(User user) {
        String sid = UUID.randomUUID().toString();
        String accessToken = jwtTokenProvider.createAccessToken(
                user.getId(),
                user.getEmail(),
                user.getRole().name(),
                sid
        );
        String refreshToken = jwtTokenProvider.createRefreshToken(user.getId(), sid);
        activeSessionService.setActiveSession(
                user.getId(),
                sid,
                jwtProperties.getRefreshTokenExpiration()
        );

        return AuthTokenResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .user(UserResponse.from(user))
                .build();
    }

    private String normalizeLoginId(String loginId) {
        return loginId.trim().toLowerCase(Locale.ROOT);
    }

    private String providerId(String loginId, String password) {
        return PROVIDER_ID_PREFIX + loginId + ":" + sha256(password);
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
