package com.ssafy.ssasukae.global.security.jwt;

import lombok.RequiredArgsConstructor;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Date;

@Component
@RequiredArgsConstructor
public class TokenBlacklistService {

    private static final String BLACKLIST_KEY_PREFIX = "auth:blacklist:";

    private final StringRedisTemplate redisTemplate;

    public void blacklist(String jti, Date expiration) {
        long ttlMillis = expiration.getTime() - System.currentTimeMillis();

        if (ttlMillis <= 0) {
            return;
        }

        redisTemplate.opsForValue().set(
                BLACKLIST_KEY_PREFIX + jti,
                "true",
                Duration.ofMillis(ttlMillis)
        );
    }

    public boolean isBlacklisted(String jti) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(BLACKLIST_KEY_PREFIX + jti));
    }
}
