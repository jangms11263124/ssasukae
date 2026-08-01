package com.ssafy.ssasukae.domain.performance.redis.performance;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

class PerformanceSnapshotReconnectTest {

  @Test
  void suspendsAtCurrentPositionAndResumesWithoutCountingDisconnectedTime() {
    OffsetDateTime preparedAt = OffsetDateTime.of(2026, 7, 31, 12, 0, 0, 0, ZoneOffset.UTC);
    PerformanceSnapShot playing =
        PerformanceSnapShot.prepare(1L, 10L, 100L, 1000L, 20L, 180_000L, preparedAt)
            .startPlayback(preparedAt.plusSeconds(2));

    PerformanceSnapShot suspended =
        playing.suspendForPerformerDisconnect(preparedAt.plusSeconds(42));

    assertThat(suspended.status()).isEqualTo(PerformanceStatus.SUSPENDED);
    assertThat(suspended.suspendedFromStatus()).isEqualTo(PerformanceStatus.PLAYING);
    assertThat(suspended.playbackPositionMs()).isEqualTo(40_000L);
    assertThat(suspended.playbackPositionAt(preparedAt.plusMinutes(2))).isEqualTo(40_000L);

    PerformanceSnapShot resumed =
        suspended.resumeAfterPerformerReconnect(preparedAt.plusSeconds(52));

    assertThat(resumed.status()).isEqualTo(PerformanceStatus.PLAYING);
    assertThat(resumed.playbackPositionAt(preparedAt.plusSeconds(62))).isEqualTo(50_000L);
    assertThat(resumed.suspendedAt()).isNull();
  }

  @Test
  void resumesPreparationWithoutCreatingPlaybackTimeline() {
    OffsetDateTime preparedAt = OffsetDateTime.of(2026, 7, 31, 12, 0, 0, 0, ZoneOffset.UTC);
    PerformanceSnapShot preparing =
        PerformanceSnapShot.prepare(1L, 10L, 100L, 1000L, 20L, 180_000L, preparedAt);

    PerformanceSnapShot resumed =
        preparing
            .suspendForPerformerDisconnect(preparedAt.plusSeconds(2))
            .resumeAfterPerformerReconnect(preparedAt.plusSeconds(7));

    assertThat(resumed.status()).isEqualTo(PerformanceStatus.PREPARING);
    assertThat(resumed.startedAt()).isNull();
    assertThat(resumed.playbackPositionMs()).isZero();
  }
}
