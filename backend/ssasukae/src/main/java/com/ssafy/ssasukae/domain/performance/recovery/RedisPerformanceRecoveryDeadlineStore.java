package com.ssafy.ssasukae.domain.performance.recovery;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

import lombok.RequiredArgsConstructor;

@Repository
@RequiredArgsConstructor
public class RedisPerformanceRecoveryDeadlineStore implements PerformanceRecoveryDeadlineStore {

  private static final String DEADLINE_KEY = "performance:recovery:deadlines";

  private final StringRedisTemplate redisTemplate;

  @Override
  public void save(Long performanceId, Instant deadline) {
    validatePerformanceId(performanceId);
    if (deadline == null) {
      throw new IllegalArgumentException("deadline은 필수입니다.");
    }

    redisTemplate.opsForZSet().add(DEADLINE_KEY, performanceId.toString(), deadline.toEpochMilli());
  }

  @Override
  public void delete(Long performanceId) {
    validatePerformanceId(performanceId);
    redisTemplate.opsForZSet().remove(DEADLINE_KEY, performanceId.toString());
  }

  // 만료가된 공연 정보의 ID만 가져옴
  @Override
  public List<Long> findDuePerformanceIds(Instant now, int limit) {
    if (now == null) {
      throw new IllegalArgumentException("now는 필수입니다.");
    }
    if (limit <= 0) {
      throw new IllegalArgumentException("limit은 양의 정수여야 합니다.");
    }

    Set<String> values =
        redisTemplate
            .opsForZSet()
            .rangeByScore(DEADLINE_KEY, Double.NEGATIVE_INFINITY, now.toEpochMilli(), 0, limit);

    if (values == null || values.isEmpty()) {
      return List.of();
    }

    return values.stream().map(this::parsePerformanceId).toList();
  }

  private Long parsePerformanceId(String value) {
    try {
      return Long.valueOf(value);
    } catch (NumberFormatException exception) {
      redisTemplate.opsForZSet().remove(DEADLINE_KEY, value);
      throw new IllegalStateException("복구 대상 공연 ID가 올바르지 않습니다. value=" + value, exception);
    }
  }

  private void validatePerformanceId(Long performanceId) {
    if (performanceId == null || performanceId <= 0) {
      throw new IllegalArgumentException("performanceId는 양의 정수여야 합니다.");
    }
  }
}
