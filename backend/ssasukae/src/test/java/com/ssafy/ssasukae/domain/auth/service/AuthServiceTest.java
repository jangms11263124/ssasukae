package com.ssafy.ssasukae.domain.auth.service;

import com.ssafy.ssasukae.domain.auth.dto.AuthTokenResponse;
import com.ssafy.ssasukae.domain.auth.dto.OAuthLoginResult;
import com.ssafy.ssasukae.domain.auth.dto.OAuthSignupRequest;
import com.ssafy.ssasukae.domain.auth.dto.SignupTokenClaims;
import com.ssafy.ssasukae.domain.auth.dto.TokenReissueResponse;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.service.UserService;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.auth.AuthErrorCode;
import com.ssafy.ssasukae.global.security.jwt.ActiveSessionService;
import com.ssafy.ssasukae.global.security.jwt.JwtProperties;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;
import com.ssafy.ssasukae.global.security.jwt.TokenBlacklistService;
import com.ssafy.ssasukae.global.security.oauth.userinfo.OAuth2UserInfo;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.test.util.ReflectionTestUtils;

import java.util.Date;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserService userService;
    @Mock
    private JwtTokenProvider jwtTokenProvider;
    @Mock
    private TokenBlacklistService tokenBlacklistService;
    @Mock
    private ActiveSessionService activeSessionService;
    @Mock
    private JwtProperties jwtProperties;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userService, jwtTokenProvider, tokenBlacklistService, activeSessionService, jwtProperties);
    }

    private User userWithId(Long id) {
        User user = User.builder()
                .email("a@test.com")
                .nickname("nick")
                .provider(OAuthProvider.GOOGLE)
                .providerId("google-1")
                .role(Role.USER)
                .build();
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    @Test
    @DisplayName("이미 가입된 유저면 registered 결과를 반환한다")
    void processOAuthLogin_returnsRegisteredResult_whenUserExists() {
        // given
        User existingUser = userWithId(1L);
        OAuth2UserInfo userInfo = stubUserInfo("google-1", "a@test.com", "nick", null);
        when(userService.findByProviderAndProviderId(OAuthProvider.GOOGLE, "google-1"))
                .thenReturn(Optional.of(existingUser));

        // when
        OAuthLoginResult result = authService.processOAuthLogin(OAuthProvider.GOOGLE, userInfo);

        // then
        assertThat(result.isRegistered()).isTrue();
        assertThat(result.getUser()).isEqualTo(existingUser);
    }

    @Test
    @DisplayName("미가입 유저면 unregistered 결과를 반환한다")
    void processOAuthLogin_returnsUnregisteredResult_whenUserDoesNotExist() {
        // given
        OAuth2UserInfo userInfo = stubUserInfo("google-2", "b@test.com", "nick2", "http://img");
        when(userService.findByProviderAndProviderId(OAuthProvider.GOOGLE, "google-2"))
                .thenReturn(Optional.empty());

        // when
        OAuthLoginResult result = authService.processOAuthLogin(OAuthProvider.GOOGLE, userInfo);

        // then
        assertThat(result.isRegistered()).isFalse();
        assertThat(result.getProviderId()).isEqualTo("google-2");
        assertThat(result.getEmail()).isEqualTo("b@test.com");
    }

    @Test
    @DisplayName("이미 가입된 provider/providerId면 회원가입 시 예외가 발생한다")
    void completeSignup_throws_whenAlreadyRegistered() {
        // given
        SignupTokenClaims claims = SignupTokenClaims.builder()
                .provider(OAuthProvider.GOOGLE)
                .providerId("google-1")
                .email("a@test.com")
                .nickname("nick")
                .build();
        OAuthSignupRequest request = new OAuthSignupRequest();
        ReflectionTestUtils.setField(request, "signupToken", "signup-token");

        when(jwtTokenProvider.getSignupTokenClaims("signup-token")).thenReturn(claims);
        when(userService.findByProviderAndProviderId(OAuthProvider.GOOGLE, "google-1"))
                .thenReturn(Optional.of(userWithId(1L)));

        // when & then
        assertThatThrownBy(() -> authService.completeSignup(request))
                .isInstanceOf(CustomException.class)
                .extracting(e -> ((CustomException) e).getErrorCode())
                .isEqualTo(AuthErrorCode.ALREADY_REGISTERED);
    }

    @Test
    @DisplayName("회원가입 완료 시 sid를 발급해 활성 세션으로 등록하고 토큰을 반환한다")
    void completeSignup_registersActiveSessionAndReturnsTokens() {
        // given
        SignupTokenClaims claims = SignupTokenClaims.builder()
                .provider(OAuthProvider.GOOGLE)
                .providerId("google-1")
                .email("a@test.com")
                .nickname("claim-nick")
                .profileImageUrl("claim-img")
                .build();
        OAuthSignupRequest request = new OAuthSignupRequest();
        ReflectionTestUtils.setField(request, "signupToken", "signup-token");
        ReflectionTestUtils.setField(request, "nickname", "user-nick");

        User createdUser = userWithId(10L);

        when(jwtTokenProvider.getSignupTokenClaims("signup-token")).thenReturn(claims);
        when(userService.findByProviderAndProviderId(OAuthProvider.GOOGLE, "google-1"))
                .thenReturn(Optional.empty());
        when(userService.createOAuthUser(OAuthProvider.GOOGLE, "google-1", "a@test.com", "user-nick", "claim-img"))
                .thenReturn(createdUser);
        when(jwtTokenProvider.createAccessToken(eq(10L), anyString(), anyString(), anyString())).thenReturn("access-token");
        when(jwtTokenProvider.createRefreshToken(eq(10L), anyString())).thenReturn("refresh-token");
        when(jwtProperties.getRefreshTokenExpiration()).thenReturn(604_800_000L);

        // when
        AuthTokenResponse response = authService.completeSignup(request);

        // then
        assertThat(response.getAccessToken()).isEqualTo("access-token");
        assertThat(response.getRefreshToken()).isEqualTo("refresh-token");
        verify(activeSessionService).setActiveSession(eq(10L), anyString(), eq(604_800_000L));
    }

    @Test
    @DisplayName("유효하지 않은 refresh token이면 예외가 발생한다")
    void reissueToken_throws_whenTokenIsInvalid() {
        // given
        when(jwtTokenProvider.validateToken("bad-token")).thenReturn(false);

        // when & then
        assertThatThrownBy(() -> authService.reissueToken("bad-token"))
                .isInstanceOf(CustomException.class)
                .extracting(e -> ((CustomException) e).getErrorCode())
                .isEqualTo(AuthErrorCode.INVALID_REFRESH_TOKEN);
    }

    @Test
    @DisplayName("이미 블랙리스트에 등록된 refresh token이면 예외가 발생한다")
    void reissueToken_throws_whenTokenIsBlacklisted() {
        // given
        when(jwtTokenProvider.validateToken("used-token")).thenReturn(true);
        when(jwtTokenProvider.getJti("used-token")).thenReturn("jti-1");
        when(tokenBlacklistService.isBlacklisted("jti-1")).thenReturn(true);

        // when & then
        assertThatThrownBy(() -> authService.reissueToken("used-token"))
                .isInstanceOf(CustomException.class)
                .extracting(e -> ((CustomException) e).getErrorCode())
                .isEqualTo(AuthErrorCode.REFRESH_TOKEN_ALREADY_USED);
    }

    @Test
    @DisplayName("다른 기기 로그인으로 활성 세션의 sid가 바뀌었으면 재발급을 거부한다")
    void reissueToken_throws_whenSidDoesNotMatchActiveSession() {
        // given
        when(jwtTokenProvider.validateToken("stale-token")).thenReturn(true);
        when(jwtTokenProvider.getJti("stale-token")).thenReturn("jti-1");
        when(tokenBlacklistService.isBlacklisted("jti-1")).thenReturn(false);
        when(jwtTokenProvider.getUserId("stale-token")).thenReturn(1L);
        when(jwtTokenProvider.getSid("stale-token")).thenReturn("old-sid");
        when(activeSessionService.isActiveSession(1L, "old-sid")).thenReturn(false);

        // when & then
        assertThatThrownBy(() -> authService.reissueToken("stale-token"))
                .isInstanceOf(CustomException.class)
                .extracting(e -> ((CustomException) e).getErrorCode())
                .isEqualTo(AuthErrorCode.SESSION_EXPIRED);
    }

    @Test
    @DisplayName("정상 재발급 시 기존 jti를 블랙리스트에 등록하고 같은 sid로 새 토큰을 발급한다")
    void reissueToken_rotatesTokenAndKeepsSameSid() {
        // given
        User user = userWithId(1L);
        Date expiration = new Date(System.currentTimeMillis() + 10_000L);

        when(jwtTokenProvider.validateToken("old-refresh-token")).thenReturn(true);
        when(jwtTokenProvider.getJti("old-refresh-token")).thenReturn("jti-old");
        when(tokenBlacklistService.isBlacklisted("jti-old")).thenReturn(false);
        when(jwtTokenProvider.getUserId("old-refresh-token")).thenReturn(1L);
        when(jwtTokenProvider.getSid("old-refresh-token")).thenReturn("sid-1");
        when(activeSessionService.isActiveSession(1L, "sid-1")).thenReturn(true);
        when(userService.findById(1L)).thenReturn(user);
        when(jwtTokenProvider.getExpiration("old-refresh-token")).thenReturn(expiration);
        when(jwtTokenProvider.createAccessToken(1L, "a@test.com", "USER", "sid-1")).thenReturn("new-access-token");
        when(jwtTokenProvider.createRefreshToken(1L, "sid-1")).thenReturn("new-refresh-token");
        when(jwtProperties.getRefreshTokenExpiration()).thenReturn(604_800_000L);

        // when
        TokenReissueResponse response = authService.reissueToken("old-refresh-token");

        // then
        assertThat(response.getAccessToken()).isEqualTo("new-access-token");
        assertThat(response.getRefreshToken()).isEqualTo("new-refresh-token");
        verify(tokenBlacklistService).blacklist("jti-old", expiration);
        verify(activeSessionService).setActiveSession(1L, "sid-1", 604_800_000L);
    }

    @Test
    @DisplayName("로그아웃 시 access/refresh token을 모두 블랙리스트에 등록하고 활성 세션을 삭제한다")
    void logout_blacklistsBothTokensAndClearsActiveSession() {
        // given
        Date accessExpiration = new Date(System.currentTimeMillis() + 5_000L);
        Date refreshExpiration = new Date(System.currentTimeMillis() + 10_000L);

        when(jwtTokenProvider.validateToken("access-token")).thenReturn(true);
        when(jwtTokenProvider.validateToken("refresh-token")).thenReturn(true);
        when(jwtTokenProvider.getUserId("access-token")).thenReturn(1L);
        when(jwtTokenProvider.getUserId("refresh-token")).thenReturn(1L);
        when(jwtTokenProvider.getJti("access-token")).thenReturn("jti-access");
        when(jwtTokenProvider.getJti("refresh-token")).thenReturn("jti-refresh");
        when(jwtTokenProvider.getExpiration("access-token")).thenReturn(accessExpiration);
        when(jwtTokenProvider.getExpiration("refresh-token")).thenReturn(refreshExpiration);

        // when
        authService.logout("access-token", "refresh-token");

        // then
        verify(tokenBlacklistService).blacklist("jti-access", accessExpiration);
        verify(tokenBlacklistService).blacklist("jti-refresh", refreshExpiration);
        verify(activeSessionService, times(2)).clearActiveSession(1L);
    }

    @Test
    @DisplayName("비어있거나 유효하지 않은 토큰은 로그아웃 처리에서 조용히 스킵된다")
    void logout_skipsBlacklistAndSessionClear_whenTokenIsBlankOrInvalid() {
        // given
        when(jwtTokenProvider.validateToken("invalid-refresh")).thenReturn(false);

        // when
        authService.logout(null, "invalid-refresh");

        // then
        verify(tokenBlacklistService, never()).blacklist(anyString(), any(Date.class));
        verify(activeSessionService, never()).clearActiveSession(any());
    }

    private OAuth2UserInfo stubUserInfo(String providerId, String email, String nickname, String profileImageUrl) {
        return new OAuth2UserInfo() {
            @Override
            public String getProviderId() {
                return providerId;
            }

            @Override
            public String getEmail() {
                return email;
            }

            @Override
            public String getNickname() {
                return nickname;
            }

            @Override
            public String getProfileImageUrl() {
                return profileImageUrl;
            }
        };
    }
}
