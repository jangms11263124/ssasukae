package com.ssafy.ssasukae.integration.ai;

import java.nio.charset.StandardCharsets;
import java.util.Date;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import io.jsonwebtoken.security.MacAlgorithm;

/**
 * 관리자가 AI 서버에 직접 곡 분석을 요청할 때 들고 갈 단발성 티켓을 발급한다.
 * jwt.secret과는 별도의 시크릿으로 서명한다 — AI 서버에 유출되어도 우리 백엔드용 JWT를 위조할 수 없도록 분리.
 * 검증은 AI 서버 쪽 책임이라 이 백엔드에는 검증 로직이 없다.
 */
@Component
public class AiUploadTicketProvider {

    private static final String PURPOSE_CLAIM = "purpose";
    private static final String PURPOSE_SONG_AI_UPLOAD = "SONG_AI_UPLOAD";

    // 시크릿 길이에 따라 알고리즘이 자동으로 HS384/HS512로 바뀌지 않도록 HS256으로 명시 고정한다.
    private static final MacAlgorithm SIGNATURE_ALGORITHM = Jwts.SIG.HS256;

    private final SecretKey signingKey;
    private final long expirationMillis;

    public AiUploadTicketProvider(
            @Value("${ai.upload-ticket-secret}") String secret,
            @Value("${ai.upload-ticket-expiration-ms}") long expirationMillis
    ) {
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMillis = expirationMillis;
    }

    public String issueTicket(Long adminUserId) {
        Date now = new Date();
        Date expiresAt = new Date(now.getTime() + expirationMillis);

        return Jwts.builder()
                .claim(PURPOSE_CLAIM, PURPOSE_SONG_AI_UPLOAD)
                .subject(String.valueOf(adminUserId))
                .issuedAt(now)
                .expiration(expiresAt)
                .signWith(signingKey, SIGNATURE_ALGORITHM)
                .compact();
    }
}
