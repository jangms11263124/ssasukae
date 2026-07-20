package com.ssafy.ssasukae.global.security.jwt;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TokenBlacklistServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    private TokenBlacklistService tokenBlacklistService;

    @BeforeEach
    void setUp() {
        tokenBlacklistService = new TokenBlacklistService(redisTemplate);
    }

    @Test
    @DisplayName("만료까지 남은 시간만큼 TTL을 설정해 블랙리스트에 등록한다")
    void blacklist_storesJtiWithRemainingTtl() {
        // given
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        Date expiration = new Date(System.currentTimeMillis() + 10_000L);

        // when
        tokenBlacklistService.blacklist("jti-1", expiration);

        // then
        verify(valueOperations).set(eq("auth:blacklist:jti-1"), eq("true"), any(Duration.class));
    }

    @Test
    @DisplayName("이미 만료된 토큰은 Redis에 쓰지 않는다")
    void blacklist_doesNothing_whenAlreadyExpired() {
        // given
        Date pastExpiration = new Date(System.currentTimeMillis() - 10_000L);

        // when
        tokenBlacklistService.blacklist("jti-1", pastExpiration);

        // then
        verifyNoInteractions(redisTemplate);
    }

    @Test
    @DisplayName("블랙리스트에 등록된 jti는 true를 반환한다")
    void isBlacklisted_returnsTrue_whenKeyExists() {
        // given
        when(redisTemplate.hasKey("auth:blacklist:jti-1")).thenReturn(true);

        // when
        boolean result = tokenBlacklistService.isBlacklisted("jti-1");

        // then
        assertThat(result).isTrue();
    }

    @Test
    @DisplayName("블랙리스트에 없는 jti는 false를 반환한다")
    void isBlacklisted_returnsFalse_whenKeyDoesNotExist() {
        // given
        when(redisTemplate.hasKey("auth:blacklist:jti-1")).thenReturn(false);

        // when
        boolean result = tokenBlacklistService.isBlacklisted("jti-1");

        // then
        assertThat(result).isFalse();
    }
}
