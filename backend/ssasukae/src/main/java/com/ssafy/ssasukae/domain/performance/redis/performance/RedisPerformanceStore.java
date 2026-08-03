package com.ssafy.ssasukae.domain.performance.redis.performance;

import java.time.Duration;
import java.util.Collections;
import java.util.Optional;

import lombok.RequiredArgsConstructor;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.serializer.SerializationException;
import org.springframework.stereotype.Repository;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * 진행 중인 공연 상태를 Redis에 저장하고 관리하는 저장소.
 *
 * 공연 상태는 다음 두 가지 키로 관리한다.
 *
 * {@code performance:session:{performanceId}}: 공연의 전체 상태인 {@link PerformanceSnapShot}을 저장한다.
 * {@code performance:room:{roomId}:active}: 해당 방에서 현재 활성화된 공연 ID를 저장한다.
 *
 *
 *
 * 방별 활성 공연 키를 별도로 관리하여 하나의 방에 여러 공연이 동시에 생성되는 것을 방지한다.
 */
@Repository
@RequiredArgsConstructor
public class RedisPerformanceStore implements PerformanceStore {

    // 공연 Snapshot 저장 키
    private static final String SESSION_KEY_PREFIX = "performance:session:";

    // 방별 활성 공연 키의 접두사
    private static final String ACTIVE_ROOM_KEY_PREFIX = "performance:room:";

    private static final String ACTIVE_ROOM_KEY_SUFFIX = ":active";

    // 공연 ID를 순차적으로 발급하기 위한 Redis 키
    private static final String SEQUENCE_KEY = "performance:id:sequence";

    // 공연 세션의 Redis 저장 유지 시간
    private static final Duration SESSION_TTL =
            Duration.ofMinutes(20);

    // 활성 공연 키의 현재 값이 전달받은 공연 ID와 일치할 때만 해당 키를 삭제하는 Lua 스크립트
    private static final DefaultRedisScript<Long>
            DELETE_IF_MATCHES_SCRIPT =
            new DefaultRedisScript<>(
                    "if redis.call('get', KEYS[1]) == ARGV[1] "
                            + "then return redis.call('del', KEYS[1]) "
                            + "else return 0 end",
                    Long.class
            );

    private static final DefaultRedisScript<Long> CREATE_SCRIPT =
            new DefaultRedisScript<>(
                    "if redis.call('exists', KEYS[1]) == 1 then return 0 end "
                            + "redis.call('psetex', KEYS[1], ARGV[3], ARGV[1]) "
                            + "redis.call('psetex', KEYS[2], ARGV[3], ARGV[2]) return 1",
                    Long.class
            );

    private static final DefaultRedisScript<Long> SAVE_ACTIVE_SCRIPT =
            new DefaultRedisScript<>(
                    "if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end "
                            + "redis.call('psetex', KEYS[2], ARGV[3], ARGV[2]) "
                            + "redis.call('pexpire', KEYS[1], ARGV[3]) return 1",
                    Long.class
            );

    private static final DefaultRedisScript<Long> REPLACE_IF_UNCHANGED_SCRIPT =
            new DefaultRedisScript<>(
                    "if redis.call('get', KEYS[1]) ~= ARGV[1] then return -1 end "
                            + "if redis.call('get', KEYS[2]) ~= ARGV[2] then return 0 end "
                            + "redis.call('psetex', KEYS[2], ARGV[4], ARGV[3]) "
                            + "redis.call('pexpire', KEYS[1], ARGV[4]) return 1",
                    Long.class
            );

    private static final DefaultRedisScript<Long> DELETE_SESSION_SCRIPT =
            new DefaultRedisScript<>(
                    "local deleted = redis.call('del', KEYS[2]) "
                            + "if redis.call('get', KEYS[1]) == ARGV[1] then "
                            + "deleted = deleted + redis.call('del', KEYS[1]) end return deleted",
                    Long.class
            );

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    // 새로운 공연 ID를 발급한다.
    @Override
    public long nextPerformanceId() {
        Long performanceId =
                redisTemplate
                        .opsForValue()
                        .increment(SEQUENCE_KEY);

        if (performanceId == null || performanceId <= 0) {
            throw new IllegalStateException(
                    "공연 ID를 생성하지 못했습니다."
            );
        }

        return performanceId;
    }

    // 새로운 공연 세션을 생성한다.
    @Override
    public boolean create(PerformanceSnapShot session) {
        String activeRoomKey = activeRoomKey(session.roomId());
        String performanceId = session.performanceId().toString();
        String serializedSession = serialize(session);
        Long created = redisTemplate.execute(
                CREATE_SCRIPT,
                java.util.List.of(activeRoomKey, sessionKey(session.performanceId())),
                performanceId,
                serializedSession,
                Long.toString(SESSION_TTL.toMillis())
        );
        return Long.valueOf(1L).equals(created);
    }

    // 현재 활성화된 공연 Snapshot을 갱신한다.
    @Override
    public void save(PerformanceSnapShot session) {
        String activeRoomKey = activeRoomKey(session.roomId());
        String performanceId = session.performanceId().toString();
        Long saved = redisTemplate.execute(
                SAVE_ACTIVE_SCRIPT,
                java.util.List.of(activeRoomKey, sessionKey(session.performanceId())),
                performanceId,
                serialize(session),
                Long.toString(SESSION_TTL.toMillis())
        );
        if (!Long.valueOf(1L).equals(saved)) {
            throw new IllegalStateException("현재 활성화된 공연 세션이 아닙니다.");
        }
    }

    @Override
    public boolean replace(PerformanceSnapShot expected, PerformanceSnapShot changed) {
        if (!expected.performanceId().equals(changed.performanceId())
                || !expected.roomId().equals(changed.roomId())) {
            throw new IllegalArgumentException("같은 공연 스냅샷끼리만 교체할 수 있습니다.");
        }
        Long replaced = redisTemplate.execute(
                REPLACE_IF_UNCHANGED_SCRIPT,
                java.util.List.of(activeRoomKey(changed.roomId()), sessionKey(changed.performanceId())),
                changed.performanceId().toString(),
                serialize(expected),
                serialize(changed),
                Long.toString(SESSION_TTL.toMillis())
        );
        return Long.valueOf(1L).equals(replaced);
    }

    // 공연 ID를 기준으로 공연 Snapshot을 조회한다.
    @Override
    public Optional<PerformanceSnapShot> findByPerformanceId(
            Long performanceId
    ) {
        if (performanceId == null || performanceId <= 0) {
            return Optional.empty();
        }

        String value = redisTemplate
                        .opsForValue()
                        .get(sessionKey(performanceId));

        return Optional.ofNullable(value).map(this::deserialize);
    }

    // 특정 방에서 현재 활성화된 공연 Snapshot을 조회한다.
    @Override
    public Optional<PerformanceSnapShot> findActiveByRoomId(
            Long roomId
    ) {
        if (roomId == null || roomId <= 0) {
            return Optional.empty();
        }

        String activeRoomKey =
                activeRoomKey(roomId);

        String performanceIdValue = redisTemplate
                        .opsForValue()
                        .get(activeRoomKey);

        if (performanceIdValue == null) {
            return Optional.empty();
        }

        Long performanceId;

        try {
            performanceId =
                    Long.valueOf(performanceIdValue);
        } catch (NumberFormatException exception) {
            /*
             * 활성 공연 키에 숫자가 아닌 잘못된 값이 저장된 경우
             * 정상적인 공연 ID로 사용할 수 없으므로 해당 키를 제거한다.
             */
            redisTemplate.delete(activeRoomKey);
            return Optional.empty();
        }

        Optional<PerformanceSnapShot> session =
                findByPerformanceId(performanceId);

        /*
         * 활성 공연 ID가 실제 Snapshot을 가리키지 않거나
         * 이미 종료 상태인 경우 관련 Redis 데이터를 정리한다.
         */
        if (session.isEmpty()) {
            /*
             * 종료된 Snapshot이 존재한다면 해당 세션 키도 제거한다.
             * Snapshot 자체가 없다면 삭제 작업은 수행되지 않는다.
             */
            session.ifPresent(
                    value ->
                            redisTemplate.delete(
                                    sessionKey(value.performanceId())
                            )
            );

            /*
             * 현재 활성 공연 키의 값이 조회한 performanceId와
             * 일치할 때만 활성 공연 키를 제거한다.
             */
            releaseActiveRoom(
                    activeRoomKey,
                    performanceIdValue
            );

            return Optional.empty();
        }

        return session;
    }

    // 공연 Snapshot과 방별 활성 공연 연결 정보를 삭제한다.
    @Override
    public void delete(PerformanceSnapShot session) {
        redisTemplate.execute(
                DELETE_SESSION_SCRIPT,
                java.util.List.of(activeRoomKey(session.roomId()), sessionKey(session.performanceId())),
                session.performanceId().toString()
        );
    }

    // 공연 Snapshot을 Redis에 저장할 JSON 문자열로 변환한다.
    private String serialize(PerformanceSnapShot session) {
        try {
            return objectMapper.writeValueAsString(session);
        } catch (JacksonException exception) {
            throw new SerializationException(
                    "공연 세션 직렬화에 실패했습니다.",
                    exception
            );
        }
    }

    // Redis에서 조회한 JSON 문자열을 공연 Snapshot으로 변환한다.
    private PerformanceSnapShot deserialize(String value) {
        try {
            return objectMapper.readValue(
                    value,
                    PerformanceSnapShot.class
            );
        } catch (JacksonException exception) {
            throw new SerializationException(
                    "공연 세션 역직렬화에 실패했습니다.",
                    exception
            );
        }
    }

    // 활성 공연 키가 전달받은 공연 ID를 가리킬 때만 삭제한다.
    private void releaseActiveRoom(
            String activeRoomKey,
            String performanceId
    ) {
        redisTemplate.execute(
                DELETE_IF_MATCHES_SCRIPT,
                Collections.singletonList(activeRoomKey),
                performanceId
        );
    }

    // 공연 ID에 대응하는 공연 Snapshot 키를 생성한다.
    private String sessionKey(Long performanceId) {
        return SESSION_KEY_PREFIX + performanceId;
    }

    // 방 ID에 대응하는 활성 공연 키를 생성한다.
    private String activeRoomKey(Long roomId) {
        return ACTIVE_ROOM_KEY_PREFIX + roomId + ACTIVE_ROOM_KEY_SUFFIX;
    }
}
