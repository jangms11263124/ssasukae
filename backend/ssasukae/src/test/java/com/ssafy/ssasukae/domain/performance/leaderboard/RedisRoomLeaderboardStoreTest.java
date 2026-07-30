package com.ssafy.ssasukae.domain.performance.leaderboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.ssafy.ssasukae.domain.performance.redis.leaderboard.RedisRoomLeaderboardStore;
import com.ssafy.ssasukae.domain.performance.redis.leaderboard.RoomLeaderboardEntry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

import tools.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class RedisRoomLeaderboardStoreTest {

  private static final Long ROOM_ID = 10L;
  private static final String REDIS_KEY = "room:10:leaderboard";

  @Mock private StringRedisTemplate redisTemplate;
  @Mock private HashOperations<String, Object, Object> hashOperations;

  private ObjectMapper objectMapper;
  private RedisRoomLeaderboardStore store;

  @BeforeEach
  void setUp() {
    objectMapper = new ObjectMapper();
    store = new RedisRoomLeaderboardStore(redisTemplate, objectMapper);
    when(redisTemplate.opsForHash()).thenReturn(hashOperations);
  }

  @Test
  @DisplayName("공연별 점수를 저장하고 finalScore 내림차순으로 리더보드를 반환한다")
  void saveAndGetRankedOrdersByFinalScore() throws Exception {
    RoomLeaderboardEntry first = entry(31L, "참가자 1", 91);
    RoomLeaderboardEntry second = entry(32L, "참가자 2", 85);
    RoomLeaderboardEntry updated = entry(33L, "참가자 3", 94);

    Map<Object, Object> values = new LinkedHashMap<>();
    values.put(first.performanceId().toString(), objectMapper.writeValueAsString(first));
    values.put(second.performanceId().toString(), objectMapper.writeValueAsString(second));
    values.put(updated.performanceId().toString(), objectMapper.writeValueAsString(updated));

    when(hashOperations.entries(REDIS_KEY)).thenReturn(values);

    List<RoomLeaderboardEntry> ranked = store.saveAndGetRanked(ROOM_ID, updated);

    assertThat(ranked).containsExactly(updated, first, second);
    verify(hashOperations)
        .put(
            REDIS_KEY,
            updated.performanceId().toString(),
            objectMapper.writeValueAsString(updated));
    verify(redisTemplate).expire(REDIS_KEY, Duration.ofHours(12));
  }

  @Test
  @DisplayName("동점이면 performanceId가 작은 공연을 먼저 반환한다")
  void saveAndGetRankedOrdersTiesByPerformanceId() throws Exception {
    RoomLeaderboardEntry later = entry(42L, "참가자 2", 90);
    RoomLeaderboardEntry earlier = entry(41L, "참가자 1", 90);

    Map<Object, Object> values =
        Map.of(
            later.performanceId().toString(),
            objectMapper.writeValueAsString(later),
            earlier.performanceId().toString(),
            objectMapper.writeValueAsString(earlier));

    when(hashOperations.entries(REDIS_KEY)).thenReturn(values);

    List<RoomLeaderboardEntry> ranked = store.saveAndGetRanked(ROOM_ID, later);

    assertThat(ranked).containsExactly(earlier, later);
  }

  @Test
  @DisplayName("리더보드 조회 중 실패하면 이번에 추가한 항목을 제거한다")
  void saveAndGetRankedDeletesAddedEntryWhenReadFails() {
    RoomLeaderboardEntry updated = entry(33L, "참가자 3", 94);

    when(hashOperations.entries(REDIS_KEY)).thenThrow(new IllegalStateException("Redis 조회 실패"));

    assertThatThrownBy(() -> store.saveAndGetRanked(ROOM_ID, updated))
        .isInstanceOf(IllegalStateException.class);

    verify(hashOperations).delete(REDIS_KEY, updated.performanceId().toString());
  }

  @Test
  @DisplayName("공연 ID로 저장된 리더보드 항목을 조회한다")
  void findReturnsStoredEntry() throws Exception {
    RoomLeaderboardEntry entry = entry(31L, "참가자 1", 91);

    when(hashOperations.get(REDIS_KEY, entry.performanceId().toString()))
        .thenReturn(objectMapper.writeValueAsString(entry));

    Optional<RoomLeaderboardEntry> found = store.find(ROOM_ID, entry.performanceId());

    assertThat(found).contains(entry);
  }

  private RoomLeaderboardEntry entry(Long performanceId, String nickname, Integer finalScore) {
    return new RoomLeaderboardEntry(
        performanceId,
        performanceId + 100,
        nickname,
        performanceId + 200,
        "테스트 곡 " + performanceId,
        finalScore);
  }
}
