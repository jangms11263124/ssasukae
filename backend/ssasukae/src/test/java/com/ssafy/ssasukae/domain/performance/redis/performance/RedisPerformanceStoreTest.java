package com.ssafy.ssasukae.domain.performance.redis.performance;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

class RedisPerformanceStoreTest {

  @Test
  void preservesOffsetDateTimeDuringSnapshotJsonRoundTrip() throws Exception {
    ObjectMapper objectMapper =
        RedisPerformanceStore.offsetPreservingMapper(new ObjectMapper());
    PerformanceSnapShot snapshot =
        PerformanceSnapShot.prepare(
            1L,
            2L,
            3L,
            4L,
            5L,
            180_000L,
            OffsetDateTime.of(2026, 8, 4, 9, 0, 0, 0, ZoneOffset.ofHours(9)));

    String original = objectMapper.writeValueAsString(snapshot);
    PerformanceSnapShot restored = objectMapper.readValue(original, PerformanceSnapShot.class);
    String roundTripped = objectMapper.writeValueAsString(restored);

    assertThat(roundTripped).isEqualTo(original);
    assertThat(restored.preparedAt().getOffset()).isEqualTo(ZoneOffset.ofHours(9));
  }
}
