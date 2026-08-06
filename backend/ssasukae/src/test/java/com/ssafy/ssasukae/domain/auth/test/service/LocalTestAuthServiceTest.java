package com.ssafy.ssasukae.domain.auth.test.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ssafy.ssasukae.domain.auth.dto.AuthTokenResponse;
import com.ssafy.ssasukae.domain.auth.test.dto.LocalTestLoginRequest;
import com.ssafy.ssasukae.domain.auth.test.dto.LocalTestSignupRequest;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.service.UserService;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.user.UserErrorCode;
import com.ssafy.ssasukae.global.security.jwt.ActiveSessionService;
import com.ssafy.ssasukae.global.security.jwt.JwtProperties;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

@ExtendWith(MockitoExtension.class)
class LocalTestAuthServiceTest {

    @Mock
    private UserService userService;
    @Mock
    private JwtTokenProvider jwtTokenProvider;
    @Mock
    private ActiveSessionService activeSessionService;
    @Mock
    private JwtProperties jwtProperties;

    private LocalTestAuthService service;

    @BeforeEach
    void setUp() {
        service = new LocalTestAuthService(
                userService,
                jwtTokenProvider,
                activeSessionService,
                jwtProperties
        );
    }

    @Test
    void signupCreatesAnIsolatedUserAndIssuesTokens() {
        when(jwtProperties.getRefreshTokenExpiration()).thenReturn(60_000L);
        when(userService.findByProviderAndProviderId(eq(OAuthProvider.GOOGLE), anyString()))
                .thenReturn(Optional.empty());
        when(userService.isNicknameAvailable("테스터")).thenReturn(true);

        User user = testUser(7L, "tester@local-test.ssafystar.invalid", "테스터");
        when(userService.createOAuthUser(
                eq(OAuthProvider.GOOGLE),
                anyString(),
                eq("tester@local-test.ssafystar.invalid"),
                eq("테스터"),
                eq(null)
        )).thenReturn(user);
        when(jwtTokenProvider.createAccessToken(eq(7L), anyString(), eq("USER"), anyString()))
                .thenReturn("access-token");
        when(jwtTokenProvider.createRefreshToken(eq(7L), anyString()))
                .thenReturn("refresh-token");

        AuthTokenResponse response = service.signup(
                new LocalTestSignupRequest("Tester", "secret", "테스터")
        );

        assertThat(response.getAccessToken()).isEqualTo("access-token");
        assertThat(response.getRefreshToken()).isEqualTo("refresh-token");
        assertThat(response.getUser().getId()).isEqualTo(7L);

        ArgumentCaptor<String> providerId = ArgumentCaptor.forClass(String.class);
        verify(userService).findByProviderAndProviderId(eq(OAuthProvider.GOOGLE), providerId.capture());
        assertThat(providerId.getValue()).startsWith("local-test:tester:");
        assertThat(providerId.getValue()).doesNotContain("secret");
        verify(activeSessionService).setActiveSession(eq(7L), anyString(), eq(60_000L));
    }

    @Test
    void loginRejectsUnknownCredentials() {
        when(userService.findByProviderAndProviderId(eq(OAuthProvider.GOOGLE), anyString()))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.login(new LocalTestLoginRequest("tester", "wrong")))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(UserErrorCode.USER_NOT_FOUND);
    }

    private User testUser(Long id, String email, String nickname) {
        User user = User.builder()
                .email(email)
                .nickname(nickname)
                .provider(OAuthProvider.GOOGLE)
                .providerId("local-test")
                .role(Role.USER)
                .build();
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }
}
