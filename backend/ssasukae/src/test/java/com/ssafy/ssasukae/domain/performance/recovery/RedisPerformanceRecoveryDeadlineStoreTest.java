package com.ssafy.ssasukae.domain.performance.recovery;

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
class RedisPerformanceRecoveryDeadlineStoreTest {

  private static final String DEADLINE_KEY = "performance:recovery:deadlines";

  @Mock private StringRedisTemplate redisTemplate;
  @Mock private ZSetOperations<String, String> zSetOperations;

  private RedisPerformanceRecoveryDeadlineStore store;

  @BeforeEach
  void setUp() {
    when(redisTemplate.opsForZSet()).thenReturn(zSetOperations);
    store = new RedisPerformanceRecoveryDeadlineStore(redisTemplate);
  }

  @Test
  @DisplayName("공연 복구 마감 시각을 epoch millisecond 점수로 ZSet에 저장한다")
  void saveStoresDeadlineInSortedSet() {
    Instant deadline = Instant.parse("2026-07-29T01:00:00Z");

    store.save(30L, deadline);

    verify(zSetOperations).add(DEADLINE_KEY, "30", deadline.toEpochMilli());
  }

  @Test
  @DisplayName("현재 시각까지 만료된 공연 ID를 제한된 개수만큼 조회한다")
  void findDuePerformanceIdsReadsExpiredMembers() {
    Instant now = Instant.parse("2026-07-29T01:00:00Z");
    when(zSetOperations.rangeByScore(
            DEADLINE_KEY,
            Double.NEGATIVE_INFINITY,
            now.toEpochMilli(),
            0,
            100))
        .thenReturn(new LinkedHashSet<>(List.of("30", "31")));

    assertThat(store.findDuePerformanceIds(now, 100)).containsExactly(30L, 31L);
  }

  @Test
  @DisplayName("공연 종료 시 복구 마감 정보를 ZSet에서 제거한다")
  void deleteRemovesDeadline() {
    store.delete(30L);

    verify(zSetOperations).remove(DEADLINE_KEY, "30");
  }
}
