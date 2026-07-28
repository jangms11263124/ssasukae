package com.ssafy.ssasukae.domain.auth.service;

import com.ssafy.ssasukae.domain.auth.dto.AuthTokenResponse;
import com.ssafy.ssasukae.domain.auth.dto.OAuthLoginResult;
import com.ssafy.ssasukae.domain.auth.dto.OAuthSignupRequest;
import com.ssafy.ssasukae.domain.auth.dto.SignupTokenClaims;
import com.ssafy.ssasukae.domain.auth.dto.TokenReissueResponse;
import com.ssafy.ssasukae.domain.user.dto.UserResponse;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.service.UserService;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.auth.AuthErrorCode;
import com.ssafy.ssasukae.global.security.jwt.ActiveSessionService;
import com.ssafy.ssasukae.global.security.jwt.JwtProperties;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;
import com.ssafy.ssasukae.global.security.jwt.TokenBlacklistService;
import com.ssafy.ssasukae.global.security.oauth.userinfo.OAuth2UserInfo;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserService userService;
    private final JwtTokenProvider jwtTokenProvider;
    private final TokenBlacklistService tokenBlacklistService;
    private final ActiveSessionService activeSessionService;
    private final JwtProperties jwtProperties;

    public OAuthLoginResult processOAuthLogin(OAuthProvider provider, OAuth2UserInfo userInfo) {
        return userService.findByProviderAndProviderId(provider, userInfo.getProviderId())
                .map(OAuthLoginResult::registered)
                .orElseGet(() -> OAuthLoginResult.unregistered(provider, userInfo));
    }

    @Transactional
    public AuthTokenResponse completeSignup(OAuthSignupRequest request) {
        SignupTokenClaims claims = jwtTokenProvider.getSignupTokenClaims(request.getSignupToken());

        userService.findByProviderAndProviderId(claims.getProvider(), claims.getProviderId())
                .ifPresent(user -> {
                    throw new CustomException(AuthErrorCode.ALREADY_REGISTERED);
                });

        String nickname = StringUtils.hasText(request.getNickname()) ? request.getNickname() : claims.getNickname();
        String profileImageUrl = StringUtils.hasText(request.getProfileImageUrl())
                ? request.getProfileImageUrl()
                : claims.getProfileImageUrl();

        User user = userService.createOAuthUser(
                claims.getProvider(),
                claims.getProviderId(),
                claims.getEmail(),
                nickname,
                profileImageUrl
        );

        String sid = UUID.randomUUID().toString();
        String accessToken = jwtTokenProvider.createAccessToken(user.getId(), user.getEmail(), user.getRole().name(), sid);
        String refreshToken = jwtTokenProvider.createRefreshToken(user.getId(), sid);

        activeSessionService.setActiveSession(user.getId(), sid, jwtProperties.getRefreshTokenExpiration());

        return AuthTokenResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .user(UserResponse.from(user))
                .build();
    }

    public TokenReissueResponse reissueToken(String refreshToken) {
        if (!jwtTokenProvider.validateToken(refreshToken)) {
            throw new CustomException(AuthErrorCode.INVALID_REFRESH_TOKEN);
        }

        String jti = jwtTokenProvider.getJti(refreshToken);

        if (tokenBlacklistService.isBlacklisted(jti)) {
            throw new CustomException(AuthErrorCode.REFRESH_TOKEN_ALREADY_USED);
        }

        Long userId = jwtTokenProvider.getUserId(refreshToken);
        String sid = jwtTokenProvider.getSid(refreshToken);

        if (!activeSessionService.isActiveSession(userId, sid)) {
            throw new CustomException(AuthErrorCode.SESSION_EXPIRED);
        }

        User user = userService.findById(userId);

        tokenBlacklistService.blacklist(jti, jwtTokenProvider.getExpiration(refreshToken));

        String newAccessToken = jwtTokenProvider.createAccessToken(user.getId(), user.getEmail(), user.getRole().name(), sid);
        String newRefreshToken = jwtTokenProvider.createRefreshToken(user.getId(), sid);

        activeSessionService.setActiveSession(userId, sid, jwtProperties.getRefreshTokenExpiration());

        return TokenReissueResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .build();
    }

    public void logout(String accessToken, String refreshToken) {
        clearActiveSessionIfValid(accessToken);
        clearActiveSessionIfValid(refreshToken);
        blacklistIfValid(accessToken);
        blacklistIfValid(refreshToken);
    }

    private void clearActiveSessionIfValid(String token) {
        if (!StringUtils.hasText(token) || !jwtTokenProvider.validateToken(token)) {
            return;
        }

        activeSessionService.clearActiveSession(jwtTokenProvider.getUserId(token));
    }

    private void blacklistIfValid(String token) {
        if (!StringUtils.hasText(token) || !jwtTokenProvider.validateToken(token)) {
            return;
        }

        tokenBlacklistService.blacklist(jwtTokenProvider.getJti(token), jwtTokenProvider.getExpiration(token));
    }
}
