package com.ssafy.ssasukae.domain.room.recovery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;

@ExtendWith(MockitoExtension.class)
class RedisParticipantWithRoomReconnectDeadlineStoreTest {

    private static final String DEADLINE_KEY = "room:participant:reconnect:deadlines";

    @Mock private StringRedisTemplate redisTemplate;
    @Mock private ZSetOperations<String, String> zSetOperations;

    private RedisParticipantReconnectDeadlineStore store;

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForZSet()).thenReturn(zSetOperations);
        store = new RedisParticipantReconnectDeadlineStore(redisTemplate);
    }

    @Test
    @DisplayName("참가자 재접속 마감 시각을 Redis ZSet에 저장한다")
    void saveStoresDeadlineInSortedSet() {
        Instant deadline = Instant.parse("2026-07-31T01:00:00Z");

        store.save(10L, deadline);

        verify(zSetOperations).add(DEADLINE_KEY, "10", deadline.toEpochMilli());
    }

    @Test
    @DisplayName("현재 시각까지 만료된 참가자 ID를 제한 개수만큼 조회한다")
    void findDueParticipantIdsReadsExpiredMembers() {
        Instant now = Instant.parse("2026-07-31T01:00:00Z");
        when(zSetOperations.rangeByScore(
                DEADLINE_KEY,
                Double.NEGATIVE_INFINITY,
                now.toEpochMilli(),
                0,
                100
        )).thenReturn(new LinkedHashSet<>(List.of("10", "11")));

        assertThat(store.findDueParticipantIds(now, 100)).containsExactly(10L, 11L);
    }

    @Test
    @DisplayName("재접속한 참가자의 마감 정보를 Redis ZSet에서 삭제한다")
    void deleteRemovesDeadline() {
        store.delete(10L);

        verify(zSetOperations).remove(DEADLINE_KEY, "10");
    }
}
