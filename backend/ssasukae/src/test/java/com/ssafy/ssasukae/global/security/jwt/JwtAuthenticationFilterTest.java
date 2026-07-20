package com.ssafy.ssasukae.global.security.jwt;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

    @Mock
    private JwtTokenProvider jwtTokenProvider;
    @Mock
    private TokenBlacklistService tokenBlacklistService;
    @Mock
    private ActiveSessionService activeSessionService;
    @Mock
    private HttpServletRequest request;
    @Mock
    private HttpServletResponse response;
    @Mock
    private FilterChain filterChain;

    private JwtAuthenticationFilter filter;

    @BeforeEach
    void setUp() {
        filter = new JwtAuthenticationFilter(jwtTokenProvider, tokenBlacklistService, activeSessionService);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("Authorization 헤더가 없으면 인증정보를 채우지 않고 체인을 계속 진행한다")
    void doFilterInternal_skipsAuthentication_whenNoAuthorizationHeader() throws Exception {
        // given
        when(request.getHeader("Authorization")).thenReturn(null);

        // when
        filter.doFilterInternal(request, response, filterChain);

        // then
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("Bearer 접두사가 없으면 토큰으로 인식하지 않는다")
    void doFilterInternal_skipsAuthentication_whenHeaderHasNoBearerPrefix() throws Exception {
        // given
        when(request.getHeader("Authorization")).thenReturn("Basic abcdef");

        // when
        filter.doFilterInternal(request, response, filterChain);

        // then
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(filterChain).doFilter(request, response);
        verifyNoInteractions(jwtTokenProvider);
    }

    @Test
    @DisplayName("유효하고 활성 세션과 sid가 일치하는 토큰은 인증정보를 채운다")
    void doFilterInternal_setsAuthentication_whenTokenIsValidAndSessionIsActive() throws Exception {
        // given
        String token = "valid.token";
        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
        when(jwtTokenProvider.validateToken(token)).thenReturn(true);
        when(jwtTokenProvider.getJti(token)).thenReturn("jti-1");
        when(tokenBlacklistService.isBlacklisted("jti-1")).thenReturn(false);
        when(jwtTokenProvider.getUserId(token)).thenReturn(1L);
        when(jwtTokenProvider.getSid(token)).thenReturn("sid-1");
        when(activeSessionService.isActiveSession(1L, "sid-1")).thenReturn(true);
        when(jwtTokenProvider.getEmail(token)).thenReturn("a@test.com");
        when(jwtTokenProvider.getRole(token)).thenReturn("USER");

        // when
        filter.doFilterInternal(request, response, filterChain);

        // then
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        assertThat(authentication).isNotNull();
        assertThat(authentication.getPrincipal()).isEqualTo(new AuthenticatedUser(1L, "a@test.com", "USER"));
        assertThat(authentication.getAuthorities())
                .extracting(Object::toString)
                .containsExactly("ROLE_USER");
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("서명 검증에 실패한 토큰은 인증정보를 채우지 않는다")
    void doFilterInternal_skipsAuthentication_whenTokenIsInvalid() throws Exception {
        // given
        String token = "invalid.token";
        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
        when(jwtTokenProvider.validateToken(token)).thenReturn(false);

        // when
        filter.doFilterInternal(request, response, filterChain);

        // then
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("블랙리스트에 등록된 토큰은 인증정보를 채우지 않는다")
    void doFilterInternal_skipsAuthentication_whenTokenIsBlacklisted() throws Exception {
        // given
        String token = "blacklisted.token";
        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
        when(jwtTokenProvider.validateToken(token)).thenReturn(true);
        when(jwtTokenProvider.getJti(token)).thenReturn("jti-1");
        when(tokenBlacklistService.isBlacklisted("jti-1")).thenReturn(true);

        // when
        filter.doFilterInternal(request, response, filterChain);

        // then
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("다른 기기 로그인으로 활성 세션의 sid와 달라진 토큰은 인증정보를 채우지 않는다")
    void doFilterInternal_skipsAuthentication_whenSidDoesNotMatchActiveSession() throws Exception {
        // given
        String token = "stale.token";
        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
        when(jwtTokenProvider.validateToken(token)).thenReturn(true);
        when(jwtTokenProvider.getJti(token)).thenReturn("jti-1");
        when(tokenBlacklistService.isBlacklisted("jti-1")).thenReturn(false);
        when(jwtTokenProvider.getUserId(token)).thenReturn(1L);
        when(jwtTokenProvider.getSid(token)).thenReturn("old-sid");
        when(activeSessionService.isActiveSession(1L, "old-sid")).thenReturn(false);

        // when
        filter.doFilterInternal(request, response, filterChain);

        // then
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(filterChain).doFilter(request, response);
    }
}
