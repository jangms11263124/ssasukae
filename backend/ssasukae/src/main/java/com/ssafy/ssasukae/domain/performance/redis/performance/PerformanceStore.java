package com.ssafy.ssasukae.domain.performance.redis.performance;

import java.util.Optional;

public interface PerformanceStore {

    long nextPerformanceId();

    boolean create(PerformanceSnapShot session);

    void save(PerformanceSnapShot session);

    Optional<PerformanceSnapShot> findByPerformanceId(Long performanceId);

    Optional<PerformanceSnapShot> findActiveByRoomId(Long roomId);

    void delete(PerformanceSnapShot session);
}
