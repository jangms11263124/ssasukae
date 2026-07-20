package com.ssafy.ssasukae.global.security.jwt;

import com.ssafy.ssasukae.domain.auth.dto.SignupTokenClaims;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtTokenProviderTest {

    private static final String SECRET = "test-secret-key-for-jwt-unit-test-must-be-long-enough-1234567890";

    private JwtProperties jwtProperties;
    private JwtTokenProvider jwtTokenProvider;

    @BeforeEach
    void setUp() {
        jwtProperties = new JwtProperties();
        jwtProperties.setSecret(SECRET);
        jwtProperties.setAccessTokenExpiration(60_000L);
        jwtProperties.setRefreshTokenExpiration(120_000L);

        jwtTokenProvider = new JwtTokenProvider(jwtProperties);
    }

    @Test
    @DisplayName("accessToken에 담은 클레임을 그대로 추출할 수 있다")
    void createAccessToken_extractsAllClaims() {
        // given
        String sid = "sid-1234";

        // when
        String token = jwtTokenProvider.createAccessToken(1L, "user@test.com", "USER", sid);

        // then
        assertThat(jwtTokenProvider.validateToken(token)).isTrue();
        assertThat(jwtTokenProvider.getUserId(token)).isEqualTo(1L);
        assertThat(jwtTokenProvider.getEmail(token)).isEqualTo("user@test.com");
        assertThat(jwtTokenProvider.getRole(token)).isEqualTo("USER");
        assertThat(jwtTokenProvider.getSid(token)).isEqualTo(sid);
        assertThat(jwtTokenProvider.getJti(token)).isNotBlank();
    }

    @Test
    @DisplayName("refreshToken은 email/role 클레임이 없고 sid만 담긴다")
    void createRefreshToken_hasNoEmailOrRoleClaim() {
        // given
        String sid = "sid-1234";

        // when
        String token = jwtTokenProvider.createRefreshToken(1L, sid);

        // then
        assertThat(jwtTokenProvider.validateToken(token)).isTrue();
        assertThat(jwtTokenProvider.getUserId(token)).isEqualTo(1L);
        assertThat(jwtTokenProvider.getSid(token)).isEqualTo(sid);
        assertThat(jwtTokenProvider.getEmail(token)).isNull();
        assertThat(jwtTokenProvider.getRole(token)).isNull();
    }

    @Test
    @DisplayName("매번 발급되는 토큰의 jti는 서로 다르다")
    void createAccessToken_generatesUniqueJti() {
        // given
        // (동일한 파라미터로 두 번 발급)

        // when
        String token1 = jwtTokenProvider.createAccessToken(1L, "a@test.com", "USER", "sid");
        String token2 = jwtTokenProvider.createAccessToken(1L, "a@test.com", "USER", "sid");

        // then
        assertThat(jwtTokenProvider.getJti(token1)).isNotEqualTo(jwtTokenProvider.getJti(token2));
    }

    @Test
    @DisplayName("만료된 토큰은 검증에 실패한다")
    void validateToken_returnsFalseForExpiredToken() {
        // given
        jwtProperties.setAccessTokenExpiration(-1_000L);
        String expiredToken = jwtTokenProvider.createAccessToken(1L, "a@test.com", "USER", "sid");

        // when
        boolean result = jwtTokenProvider.validateToken(expiredToken);

        // then
        assertThat(result).isFalse();
    }

    @Test
    @DisplayName("다른 시크릿으로 서명된 토큰은 검증에 실패한다")
    void validateToken_returnsFalseForTokenSignedWithDifferentSecret() {
        // given
        JwtProperties otherProperties = new JwtProperties();
        otherProperties.setSecret("another-secret-key-completely-different-from-the-first-one-000");
        otherProperties.setAccessTokenExpiration(60_000L);
        JwtTokenProvider otherProvider = new JwtTokenProvider(otherProperties);
        String tokenFromOtherSecret = otherProvider.createAccessToken(1L, "a@test.com", "USER", "sid");

        // when
        boolean result = jwtTokenProvider.validateToken(tokenFromOtherSecret);

        // then
        assertThat(result).isFalse();
    }

    @Test
    @DisplayName("형식이 깨진 토큰은 검증에 실패한다")
    void validateToken_returnsFalseForMalformedToken() {
        // given
        String malformedToken = "not-a-valid-jwt";

        // when
        boolean result = jwtTokenProvider.validateToken(malformedToken);

        // then
        assertThat(result).isFalse();
    }

    @Test
    @DisplayName("signupToken은 purpose와 OAuth 프로필 정보를 담아 왕복된다")
    void createSignupToken_roundTripsClaims() {
        // given
        String token = jwtTokenProvider.createSignupToken(
                OAuthProvider.GOOGLE, "google-sub-1", "a@test.com", "nick", "http://img"
        );

        // when
        SignupTokenClaims claims = jwtTokenProvider.getSignupTokenClaims(token);

        // then
        assertThat(claims.getProvider()).isEqualTo(OAuthProvider.GOOGLE);
        assertThat(claims.getProviderId()).isEqualTo("google-sub-1");
        assertThat(claims.getEmail()).isEqualTo("a@test.com");
        assertThat(claims.getNickname()).isEqualTo("nick");
        assertThat(claims.getProfileImageUrl()).isEqualTo("http://img");
    }

    @Test
    @DisplayName("signup 용도가 아닌 토큰으로 signupTokenClaims를 추출하면 예외가 발생한다")
    void getSignupTokenClaims_throwsForNonSignupToken() {
        // given
        String accessToken = jwtTokenProvider.createAccessToken(1L, "a@test.com", "USER", "sid");

        // when & then
        assertThatThrownBy(() -> jwtTokenProvider.getSignupTokenClaims(accessToken))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
