package com.ssafy.ssasukae.global.security.jwt;

import lombok.RequiredArgsConstructor;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
@RequiredArgsConstructor
public class ActiveSessionService {

    private static final String ACTIVE_SESSION_KEY_PREFIX = "auth:activeSession:";

    private final StringRedisTemplate redisTemplate;

    public void setActiveSession(Long userId, String sid, long ttlMillis) {
        redisTemplate.opsForValue().set(
                ACTIVE_SESSION_KEY_PREFIX + userId,
                sid,
                Duration.ofMillis(ttlMillis)
        );
    }

    public boolean isActiveSession(Long userId, String sid) {
        if (sid == null) {
            return false;
        }

        String activeSid = redisTemplate.opsForValue().get(ACTIVE_SESSION_KEY_PREFIX + userId);
        return sid.equals(activeSid);
    }

    public void clearActiveSession(Long userId) {
        redisTemplate.delete(ACTIVE_SESSION_KEY_PREFIX + userId);
    }
}
