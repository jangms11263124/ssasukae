package com.ssafy.ssasukae.global.security.jwt;

import com.ssafy.ssasukae.domain.auth.dto.SignupTokenClaims;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class JwtTokenProvider {

    private static final long SIGNUP_TOKEN_EXPIRATION = 10 * 60 * 1000L;

    private final JwtProperties jwtProperties;

    public String createSignupToken(
            OAuthProvider provider,
            String providerId,
            String email,
            String nickname,
            String profileImageUrl
    ) {
        Date now = new Date();
        Date expiration = new Date(now.getTime() + SIGNUP_TOKEN_EXPIRATION);

        return Jwts.builder()
                .claim("purpose", "SIGNUP")
                .claim("provider", provider.name())
                .claim("providerId", providerId)
                .claim("email", email)
                .claim("nickname", nickname)
                .claim("profileImageUrl", profileImageUrl)
                .issuedAt(now)
                .expiration(expiration)
                .signWith(getSigningKey())
                .compact();
    }

    public String createAccessToken(Long userId, String email, String role, String sid) {
        Date now = new Date();
        Date expiration = new Date(now.getTime() + jwtProperties.getAccessTokenExpiration());

        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(String.valueOf(userId))
                .claim("email", email)
                .claim("role", role)
                .claim("sid", sid)
                .issuedAt(now)
                .expiration(expiration)
                .signWith(getSigningKey())
                .compact();
    }

    public String createRefreshToken(Long userId, String sid) {
        Date now = new Date();
        Date expiration = new Date(now.getTime() + jwtProperties.getRefreshTokenExpiration());

        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(String.valueOf(userId))
                .claim("sid", sid)
                .issuedAt(now)
                .expiration(expiration)
                .signWith(getSigningKey())
                .compact();
    }

    public boolean validateToken(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public Long getUserId(String token) {
        return Long.valueOf(parseClaims(token).getSubject());
    }

    public String getEmail(String token) {
        return parseClaims(token).get("email", String.class);
    }

    public String getRole(String token) {
        return parseClaims(token).get("role", String.class);
    }

    public String getJti(String token) {
        return parseClaims(token).getId();
    }

    public String getSid(String token) {
        return parseClaims(token).get("sid", String.class);
    }

    public Date getExpiration(String token) {
        return parseClaims(token).getExpiration();
    }

    public SignupTokenClaims getSignupTokenClaims(String token) {
        Claims claims = parseClaims(token);

        String purpose = claims.get("purpose", String.class);
        if (!"SIGNUP".equals(purpose)) {
            throw new IllegalArgumentException("회원가입용 토큰이 아닙니다.");
        }

        return SignupTokenClaims.builder()
                .provider(OAuthProvider.valueOf(claims.get("provider", String.class)))
                .providerId(claims.get("providerId", String.class))
                .email(claims.get("email", String.class))
                .nickname(claims.get("nickname", String.class))
                .profileImageUrl(claims.get("profileImageUrl", String.class))
                .build();
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8));
    }
}
