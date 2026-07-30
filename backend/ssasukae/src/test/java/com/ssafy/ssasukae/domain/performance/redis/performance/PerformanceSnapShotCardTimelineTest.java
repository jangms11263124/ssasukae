package com.ssafy.ssasukae.domain.performance.redis.performance;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;

import org.junit.jupiter.api.Test;

class PerformanceSnapShotCardTimelineTest {

  @Test
  void cardCountdownPausesAndResumesTheServerPlaybackTimeline() {
    OffsetDateTime preparedAt = OffsetDateTime.parse("2026-07-29T19:59:00+09:00");
    PerformanceSnapShot playing =
        PerformanceSnapShot.prepare(1L, 10L, 20L, 30L, 40L, 210_000L, preparedAt)
            .startPlayback(preparedAt.plusSeconds(10));

    PerformanceSnapShot paused = playing.pauseForCard(preparedAt.plusSeconds(70));

    assertThat(paused.isPausedForCard()).isTrue();
    assertThat(paused.playbackPositionMs()).isEqualTo(60_000L);
    assertThat(paused.playbackPositionAt(preparedAt.plusSeconds(72))).isEqualTo(60_000L);

    PerformanceSnapShot resumed = paused.resumeAfterCard(preparedAt.plusSeconds(73));

    assertThat(resumed.isPausedForCard()).isFalse();
    assertThat(resumed.accumulatedPausedDurationMs()).isEqualTo(3_000L);
    assertThat(resumed.playbackPositionAt(preparedAt.plusSeconds(83))).isEqualTo(70_000L);
    assertThat(resumed.remainingPlaybackMs(preparedAt.plusSeconds(83))).isEqualTo(140_000L);
  }
}
