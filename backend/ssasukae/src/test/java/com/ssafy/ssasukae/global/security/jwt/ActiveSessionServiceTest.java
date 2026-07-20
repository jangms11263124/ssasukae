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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ActiveSessionServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    private ActiveSessionService activeSessionService;

    @BeforeEach
    void setUp() {
        activeSessionService = new ActiveSessionService(redisTemplate);
    }

    @Test
    @DisplayName("setActiveSession은 userId 기준 키에 sid를 TTL과 함께 저장한다")
    void setActiveSession_storesSidWithTtl() {
        // given
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);

        // when
        activeSessionService.setActiveSession(1L, "sid-1", 60_000L);

        // then
        verify(valueOperations).set("auth:activeSession:1", "sid-1", Duration.ofMillis(60_000L));
    }

    @Test
    @DisplayName("sid가 null이면 Redis를 조회하지 않고 바로 false를 반환한다")
    void isActiveSession_returnsFalseWithoutRedisLookup_whenSidIsNull() {
        // given
        String sid = null;

        // when
        boolean result = activeSessionService.isActiveSession(1L, sid);

        // then
        assertThat(result).isFalse();
        verifyNoInteractions(redisTemplate);
    }

    @Test
    @DisplayName("Redis에 저장된 sid와 일치하면 true를 반환한다")
    void isActiveSession_returnsTrue_whenSidMatchesStoredValue() {
        // given
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("auth:activeSession:1")).thenReturn("sid-1");

        // when
        boolean result = activeSessionService.isActiveSession(1L, "sid-1");

        // then
        assertThat(result).isTrue();
    }

    @Test
    @DisplayName("Redis에 저장된 sid와 다르면 false를 반환한다")
    void isActiveSession_returnsFalse_whenSidDoesNotMatchStoredValue() {
        // given
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("auth:activeSession:1")).thenReturn("sid-old");

        // when
        boolean result = activeSessionService.isActiveSession(1L, "sid-new");

        // then
        assertThat(result).isFalse();
    }

    @Test
    @DisplayName("Redis에 아무 세션도 없으면 false를 반환한다")
    void isActiveSession_returnsFalse_whenNoSessionIsStored() {
        // given
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("auth:activeSession:1")).thenReturn(null);

        // when
        boolean result = activeSessionService.isActiveSession(1L, "sid-1");

        // then
        assertThat(result).isFalse();
    }

    @Test
    @DisplayName("clearActiveSession은 userId 기준 키를 삭제한다")
    void clearActiveSession_deletesKey() {
        // given
        // (별도 스텁 없음 - 삭제 호출 자체만 검증)

        // when
        activeSessionService.clearActiveSession(1L);

        // then
        verify(redisTemplate).delete("auth:activeSession:1");
    }
}
