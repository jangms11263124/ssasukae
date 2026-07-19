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
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;
import com.ssafy.ssasukae.global.security.jwt.TokenBlacklistService;
import com.ssafy.ssasukae.global.security.oauth.userinfo.OAuth2UserInfo;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserService userService;
    private final JwtTokenProvider jwtTokenProvider;
    private final TokenBlacklistService tokenBlacklistService;

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
                    throw new IllegalArgumentException("이미 가입된 사용자입니다.");
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

        String accessToken = jwtTokenProvider.createAccessToken(user.getId(), user.getEmail(), user.getRole().name());
        String refreshToken = jwtTokenProvider.createRefreshToken(user.getId());

        return AuthTokenResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .user(UserResponse.from(user))
                .build();
    }

    public TokenReissueResponse reissueToken(String refreshToken) {
        if (!jwtTokenProvider.validateToken(refreshToken)) {
            throw new IllegalArgumentException("유효하지 않은 refresh token 입니다.");
        }

        String jti = jwtTokenProvider.getJti(refreshToken);

        if (tokenBlacklistService.isBlacklisted(jti)) {
            throw new IllegalArgumentException("이미 사용되었거나 만료된 refresh token 입니다.");
        }

        User user = userService.findById(jwtTokenProvider.getUserId(refreshToken));

        tokenBlacklistService.blacklist(jti, jwtTokenProvider.getExpiration(refreshToken));

        String newAccessToken = jwtTokenProvider.createAccessToken(user.getId(), user.getEmail(), user.getRole().name());
        String newRefreshToken = jwtTokenProvider.createRefreshToken(user.getId());

        return TokenReissueResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .build();
    }

    public void logout(String accessToken, String refreshToken) {
        blacklistIfValid(accessToken);
        blacklistIfValid(refreshToken);
    }

    private void blacklistIfValid(String token) {
        if (!StringUtils.hasText(token) || !jwtTokenProvider.validateToken(token)) {
            return;
        }

        tokenBlacklistService.blacklist(jwtTokenProvider.getJti(token), jwtTokenProvider.getExpiration(token));
    }
}
