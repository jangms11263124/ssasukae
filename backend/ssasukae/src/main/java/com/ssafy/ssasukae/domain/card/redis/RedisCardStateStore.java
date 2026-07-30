package com.ssafy.ssasukae.domain.card.redis;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.SerializationException;
import org.springframework.stereotype.Repository;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.Optional;

@Repository
@RequiredArgsConstructor
public class RedisCardStateStore implements CardStateStore {

  private static final Duration STATE_TTL = Duration.ofMinutes(30);

  private final StringRedisTemplate redisTemplate;
  private final ObjectMapper objectMapper;

  @Override
  public void saveAssignment(CardAssignmentSnapshot assignment) {
    String key = assignmentsKey(assignment.roomId(), assignment.performanceId());
    redisTemplate
        .opsForHash()
        .put(key, assignment.participantId().toString(), serialize(assignment));
    redisTemplate.expire(key, STATE_TTL);
  }

  @Override
  public Optional<CardAssignmentSnapshot> findAssignment(
      Long roomId, Long performanceId, Long participantId) {
    Object json =
        redisTemplate
            .opsForHash()
            .get(assignmentsKey(roomId, performanceId), participantId.toString());
    return Optional.ofNullable(json)
        .map(Object::toString)
        .map(value -> deserialize(value, CardAssignmentSnapshot.class));
  }

  @Override
  public Optional<RoomCardSnapshot> findRoomCard(Long roomId) {
    String json = redisTemplate.opsForValue().get(roomCardKey(roomId));
    return Optional.ofNullable(json).map(value -> deserialize(value, RoomCardSnapshot.class));
  }

  @Override
  public void saveRoomCard(RoomCardSnapshot roomCard) {
    redisTemplate.opsForValue().set(roomCardKey(roomCard.roomId()), serialize(roomCard), STATE_TTL);
  }

  @Override
  public void deleteRoomCard(Long roomId) {
    redisTemplate.delete(roomCardKey(roomId));
  }

  @Override
  public void deleteCardState(Long roomId, Long performanceId) {
    redisTemplate.delete(assignmentsKey(roomId, performanceId));
    findRoomCard(roomId)
        .filter(roomCard -> performanceId.equals(roomCard.performanceId()))
        .ifPresent(roomCard -> deleteRoomCard(roomId));
  }

  private String serialize(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JacksonException exception) {
      throw new SerializationException("카드 상태 직렬화에 실패했습니다.", exception);
    }
  }

  private <T> T deserialize(String value, Class<T> type) {
    try {
      return objectMapper.readValue(value, type);
    } catch (JacksonException exception) {
      throw new SerializationException("카드 상태 역직렬화에 실패했습니다.", exception);
    }
  }

  private String assignmentsKey(Long roomId, Long performanceId) {
    return "room:" + roomId + ":performance:" + performanceId + ":cards";
  }

  private String roomCardKey(Long roomId) {
    return "room:" + roomId + ":active-card";
  }
}
