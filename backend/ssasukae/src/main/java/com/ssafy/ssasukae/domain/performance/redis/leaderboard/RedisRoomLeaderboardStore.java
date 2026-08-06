package com.ssafy.ssasukae.domain.performance.redis.leaderboard;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.SerializationException;
import org.springframework.stereotype.Repository;

import lombok.RequiredArgsConstructor;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Repository
@RequiredArgsConstructor
public class RedisRoomLeaderboardStore implements RoomLeaderboardStore {

  private static final String KEY_PREFIX = "room:";
  private static final String KEY_SUFFIX = ":leaderboard";
  private static final Duration LEADERBOARD_TTL = Duration.ofHours(12);

  private final StringRedisTemplate redisTemplate;
  private final ObjectMapper objectMapper;

  @Override
  public Optional<RoomLeaderboardEntry> find(Long roomId, Long performanceId) {
    validatePositive(roomId, "roomId");
    validatePositive(performanceId, "performanceId");

    Object value = redisTemplate.opsForHash().get(leaderboardKey(roomId), performanceId.toString());

    return Optional.ofNullable(value).map(Object::toString).map(this::deserialize);
  }

  @Override
  public List<RoomLeaderboardEntry> findAllRanked(Long roomId) {
    validatePositive(roomId, "roomId");
    return rankedEntries(leaderboardKey(roomId));
  }

  @Override
  public List<RoomLeaderboardEntry> saveAndGetRanked(
          Long roomId,
          RoomLeaderboardEntry entry
  ) {
    validatePositive(roomId, "roomId");

    String key = leaderboardKey(roomId);
    String hashKey = entry.performanceId().toString();
    String value = serialize(entry);

    redisTemplate.opsForHash().put(key, hashKey, value);

    try {
      redisTemplate.expire(key, LEADERBOARD_TTL);

      return rankedEntries(key);

    } catch (RuntimeException exception) {
      redisTemplate.opsForHash().delete(key, hashKey);
      throw exception;
    }
  }

  @Override
  public void delete(Long roomId, Long performanceId) {
    validatePositive(roomId, "roomId");
    validatePositive(performanceId, "performanceId");
    redisTemplate.opsForHash().delete(leaderboardKey(roomId), performanceId.toString());
  }

  private String serialize(RoomLeaderboardEntry entry) {
    try {
      return objectMapper.writeValueAsString(entry);
    } catch (JacksonException exception) {
      throw new SerializationException("방 리더보드 직렬화에 실패했습니다.", exception);
    }
  }

  private RoomLeaderboardEntry deserialize(String value) {
    try {
      return objectMapper.readValue(value, RoomLeaderboardEntry.class);
    } catch (JacksonException exception) {
      throw new SerializationException("방 리더보드 역직렬화에 실패했습니다.", exception);
    }
  }

  private String leaderboardKey(Long roomId) {
    return KEY_PREFIX + roomId + KEY_SUFFIX;
  }

  private List<RoomLeaderboardEntry> rankedEntries(String key) {
    return redisTemplate.opsForHash().entries(key).values().stream()
        .map(Object::toString)
        .map(this::deserialize)
        .sorted(
            Comparator.comparing(RoomLeaderboardEntry::finalScore)
                .reversed()
                .thenComparing(RoomLeaderboardEntry::performanceId))
        .toList();
  }

  private void validatePositive(Long value, String fieldName) {
    if (value == null || value <= 0) {
      throw new IllegalArgumentException(fieldName + "는 양의 정수여야 합니다.");
    }
  }
}
