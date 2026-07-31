package com.ssafy.ssasukae.domain.room.recovery;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

import lombok.RequiredArgsConstructor;

@Repository
@RequiredArgsConstructor
public class RedisParticipantReconnectDeadlineStore implements ParticipantReconnectDeadlineStore {

    private static final String DEADLINE_KEY = "room:participant:reconnect:deadlines";

    private final StringRedisTemplate redisTemplate;

    @Override
    public void save(Long participantId, Instant deadline) {
        validateParticipantId(participantId);
        if (deadline == null) {
            throw new IllegalArgumentException("deadline은 필수입니다.");
        }

        redisTemplate.opsForZSet().add(
                DEADLINE_KEY,
                participantId.toString(),
                deadline.toEpochMilli()
        );
    }

    @Override
    public void delete(Long participantId) {
        validateParticipantId(participantId);
        redisTemplate.opsForZSet().remove(DEADLINE_KEY, participantId.toString());
    }

    @Override
    public List<Long> findDueParticipantIds(Instant now, int limit) {
        if (now == null) {
            throw new IllegalArgumentException("now는 필수입니다.");
        }
        if (limit <= 0) {
            throw new IllegalArgumentException("limit은 양의 정수여야 합니다.");
        }

        Set<String> values = redisTemplate
                .opsForZSet()
                .rangeByScore(
                        DEADLINE_KEY,
                        Double.NEGATIVE_INFINITY,
                        now.toEpochMilli(),
                        0,
                        limit
                );

        if (values == null || values.isEmpty()) {
            return List.of();
        }

        return values.stream().map(this::parseParticipantId).toList();
    }

    private Long parseParticipantId(String value) {
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException exception) {
            redisTemplate.opsForZSet().remove(DEADLINE_KEY, value);
            throw new IllegalStateException(
                    "재접속 대기 참가자 ID가 올바르지 않습니다. value=" + value,
                    exception
            );
        }
    }

    private void validateParticipantId(Long participantId) {
        if (participantId == null || participantId <= 0) {
            throw new IllegalArgumentException("participantId는 양의 정수여야 합니다.");
        }
    }
}
