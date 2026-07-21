package com.ssafy.ssasukae.domain.performance.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.global.exception.performance.PerformanceException;

import org.junit.jupiter.api.Test;

class PerformanceStateTransitionTest {

  @Test
  void followsPreparingPlayingAnalyzingFlow() {
    Performance performance = emptyPerformance();
    LocalDateTime startedAt = LocalDateTime.of(2026, 7, 22, 2, 0);
    LocalDateTime finishedAt = startedAt.plusMinutes(3);

    assertThat(performance.startPlayback(startedAt)).isTrue();
    assertThat(performance.getStatus()).isEqualTo(PerformanceStatus.PLAYING);
    assertThat(performance.getPlaybackStartedAt()).isEqualTo(startedAt);
    assertThat(performance.getVersion()).isEqualTo(2L);

    assertThat(performance.finishPlayback(finishedAt)).isTrue();
    assertThat(performance.getStatus()).isEqualTo(PerformanceStatus.ANALYZING);
    assertThat(performance.getPlaybackFinishedAt()).isEqualTo(finishedAt);
    assertThat(performance.getVersion()).isEqualTo(3L);
  }

  @Test
  void rejectsBackwardTransition() {
    Performance performance = emptyPerformance();
    LocalDateTime now = LocalDateTime.of(2026, 7, 22, 2, 0);
    performance.startPlayback(now);
    performance.finishPlayback(now.plusMinutes(3));

    assertThatThrownBy(() -> performance.startPlayback(now.plusMinutes(4)))
        .isInstanceOf(PerformanceException.class)
        .hasMessageContaining("ANALYZING에서 PLAYING");
  }

  @Test
  void duplicateTransitionIsIdempotent() {
    Performance performance = emptyPerformance();
    LocalDateTime now = LocalDateTime.of(2026, 7, 22, 2, 0);

    assertThat(performance.startPlayback(now)).isTrue();
    assertThat(performance.startPlayback(now.plusSeconds(1))).isFalse();
    assertThat(performance.getPlaybackStartedAt()).isEqualTo(now);
    assertThat(performance.getVersion()).isEqualTo(2L);
  }

  private Performance emptyPerformance() {
    return Performance.prepare(null, null, null, 1, LocalDateTime.of(2026, 7, 22, 1, 59));
  }
}
