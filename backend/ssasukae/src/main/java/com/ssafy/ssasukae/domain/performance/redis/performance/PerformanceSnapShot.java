package com.ssafy.ssasukae.domain.performance.redis.performance;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Objects;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

public record PerformanceSnapShot(
    Long performanceId,
    Long roomId,
    Long performerParticipantId,
    Long performerUserId,
    Long songId,
    PerformanceStatus status,
    PerformanceSettings settings,
    OffsetDateTime preparedAt,
    OffsetDateTime startedAt,
    OffsetDateTime playbackFinishedAt,
    Long songDurationMs,
    // 실제 멈춘 시간 누적
    Long accumulatedPausedDurationMs,
    // 서버에서 멈춘 순간의 곡 재생 위치
    Long playbackPositionMs,
    OffsetDateTime pausedAt) {

  public PerformanceSnapShot {
    requirePositive(performanceId, "performanceId");
    requirePositive(roomId, "roomId");
    requirePositive(performerParticipantId, "performerParticipantId");
    requirePositive(performerUserId, "performerUserId");
    requirePositive(songId, "songId");
    Objects.requireNonNull(status, "status는 필수입니다.");
    Objects.requireNonNull(settings, "settings는 필수입니다.");
    Objects.requireNonNull(preparedAt, "preparedAt은 필수입니다.");
    songDurationMs = songDurationMs == null ? 0L : Math.max(0L, songDurationMs);
    accumulatedPausedDurationMs =
        accumulatedPausedDurationMs == null ? 0L : Math.max(0L, accumulatedPausedDurationMs);
    playbackPositionMs = playbackPositionMs == null ? 0L : Math.max(0L, playbackPositionMs);
    validateTimeline(status, preparedAt, startedAt, playbackFinishedAt, pausedAt);
  }

  /** 기존 생성 호출과 Redis 데이터의 하위 호환을 위한 생성자입니다. */
  public PerformanceSnapShot(
      Long performanceId,
      Long roomId,
      Long performerParticipantId,
      Long performerUserId,
      Long songId,
      PerformanceStatus status,
      PerformanceSettings settings,
      OffsetDateTime preparedAt,
      OffsetDateTime startedAt,
      OffsetDateTime playbackFinishedAt) {
    this(
        performanceId,
        roomId,
        performerParticipantId,
        performerUserId,
        songId,
        status,
        settings,
        preparedAt,
        startedAt,
        playbackFinishedAt,
        0L,
        0L,
        0L,
        null);
  }

  public static PerformanceSnapShot prepare(
      Long performanceId,
      Long roomId,
      Long performerParticipantId,
      Long performerUserId,
      Long songId,
      Long songDurationMs,
      OffsetDateTime preparedAt) {
    return new PerformanceSnapShot(
        performanceId,
        roomId,
        performerParticipantId,
        performerUserId,
        songId,
        PerformanceStatus.PREPARING,
        PerformanceSettings.defaults(),
        preparedAt,
        null,
        null,
        songDurationMs,
        0L,
        0L,
        null);
  }

  public static PerformanceSnapShot prepare(
      Long performanceId,
      Long roomId,
      Long performerParticipantId,
      Long performerUserId,
      Long songId,
      OffsetDateTime preparedAt) {
    return prepare(
        performanceId, roomId, performerParticipantId, performerUserId, songId, 0L, preparedAt);
  }

  public PerformanceSnapShot startPlayback(OffsetDateTime playbackStartedAt) {
    requireStatus("공연 준비 상태에서만 재생을 시작할 수 있습니다.", PerformanceStatus.PREPARING);
    requireTimeNotBefore(playbackStartedAt, preparedAt, "startedAt", "preparedAt");
    return copy(PerformanceStatus.PLAYING, settings, playbackStartedAt, null, 0L, 0L, null);
  }

  public PerformanceSnapShot pauseForCard(OffsetDateTime at) {
    requireStatus("재생 중인 공연만 카드 카운트다운을 위해 정지할 수 있습니다.", PerformanceStatus.PLAYING);
    if (pausedAt != null) {
      throw new IllegalStateException("공연 재생이 이미 카드 카운트다운으로 정지되어 있습니다.");
    }
    requireTimeNotBefore(at, startedAt, "pausedAt", "startedAt");
    return copy(
        status,
        settings,
        startedAt,
        playbackFinishedAt,
        accumulatedPausedDurationMs,
        playbackPositionAt(at),
        at);
  }

  public PerformanceSnapShot resumeAfterCard(OffsetDateTime at) {
    requireStatus("재생 중인 공연만 다시 시작할 수 있습니다.", PerformanceStatus.PLAYING);
    if (pausedAt == null) {
      return this;
    }
    requireTimeNotBefore(at, pausedAt, "resumedAt", "pausedAt");
    long pausedMillis = Math.max(0L, Duration.between(pausedAt, at).toMillis());
    return copy(
        status,
        settings,
        startedAt,
        playbackFinishedAt,
        accumulatedPausedDurationMs + pausedMillis,
        playbackPositionMs,
        null);
  }

  public PerformanceSnapShot finishPlayback(OffsetDateTime finishedAt) {
    requireStatus("재생 중인 공연만 정상 종료할 수 있습니다.", PerformanceStatus.PLAYING);
    if (pausedAt != null) {
      throw new IllegalStateException("카드 카운트다운 정지를 해제한 뒤 공연을 종료해야 합니다.");
    }
    requireTimeNotBefore(finishedAt, startedAt, "finishedAt", "startedAt");
    return copy(
        PerformanceStatus.ANALYZING,
        settings,
        startedAt,
        finishedAt,
        accumulatedPausedDurationMs,
        playbackPositionAt(finishedAt),
        null);
  }

  public PerformanceSnapShot changeSettings(PerformanceSettings changedSettings) {
    requireStatus(
        "공연 준비 또는 재생 중에만 설정을 변경할 수 있습니다.", PerformanceStatus.PREPARING, PerformanceStatus.PLAYING);
    Objects.requireNonNull(changedSettings, "changedSettings는 필수입니다.");
    if (settings.equals(changedSettings)) {
      return this;
    }
    return copy(
        status,
        changedSettings,
        startedAt,
        playbackFinishedAt,
        accumulatedPausedDurationMs,
        playbackPositionMs,
        pausedAt);
  }

  public PerformanceSnapShot cancel() {
    requireStatus(
        "준비 또는 재생 중인 공연만 취소할 수 있습니다.", PerformanceStatus.PREPARING, PerformanceStatus.PLAYING);
    return copy(
        PerformanceStatus.CANCELLED,
        settings,
        startedAt,
        null,
        accumulatedPausedDurationMs,
        playbackPositionMs,
        null);
  }

  public PerformanceSnapShot completeAnalysis() {
    requireStatus("분석 중인 공연만 완료할 수 있습니다.", PerformanceStatus.ANALYZING);
    return copy(
        PerformanceStatus.FINISHED,
        settings,
        startedAt,
        playbackFinishedAt,
        accumulatedPausedDurationMs,
        playbackPositionMs,
        null);
  }

  public PerformanceSnapShot failAnalysis() {
    requireStatus("분석 중인 공연만 실패 처리할 수 있습니다.", PerformanceStatus.ANALYZING);
    return copy(
        PerformanceStatus.ANALYSIS_FAILED,
        settings,
        startedAt,
        playbackFinishedAt,
        accumulatedPausedDurationMs,
        playbackPositionMs,
        null);
  }

  public long playbackPositionAt(OffsetDateTime at) {
    if (startedAt == null) {
      return 0L;
    }
    if (pausedAt != null) {
      return clampPosition(playbackPositionMs);
    }
    long elapsed = Math.max(0L, Duration.between(startedAt, at).toMillis());
    return clampPosition(elapsed - accumulatedPausedDurationMs);
  }

  public long remainingPlaybackMs(OffsetDateTime at) {
    return Math.max(0L, songDurationMs - playbackPositionAt(at));
  }

  @JsonIgnore
  public boolean isPausedForCard() {
    return pausedAt != null;
  }

  public boolean belongsToRoom(Long requestedRoomId) {
    return roomId.equals(requestedRoomId);
  }

  public boolean isPerformedBy(Long participantId) {
    return performerParticipantId.equals(participantId);
  }

  @JsonIgnore
  public boolean isTerminal() {
    return status == PerformanceStatus.FINISHED
        || status == PerformanceStatus.CANCELLED
        || status == PerformanceStatus.ANALYSIS_FAILED;
  }

  private PerformanceSnapShot copy(
      PerformanceStatus changedStatus,
      PerformanceSettings changedSettings,
      OffsetDateTime changedStartedAt,
      OffsetDateTime changedFinishedAt,
      Long changedAccumulatedPausedDurationMs,
      Long changedPlaybackPositionMs,
      OffsetDateTime changedPausedAt) {
    return new PerformanceSnapShot(
        performanceId,
        roomId,
        performerParticipantId,
        performerUserId,
        songId,
        changedStatus,
        changedSettings,
        preparedAt,
        changedStartedAt,
        changedFinishedAt,
        songDurationMs,
        changedAccumulatedPausedDurationMs,
        changedPlaybackPositionMs,
        changedPausedAt);
  }

  private long clampPosition(long value) {
    long positive = Math.max(0L, value);
    return songDurationMs > 0 ? Math.min(songDurationMs, positive) : positive;
  }

  private void requireStatus(String message, PerformanceStatus... allowedStatuses) {
    boolean allowed =
        Arrays.stream(allowedStatuses).anyMatch(allowedStatus -> status == allowedStatus);
    if (!allowed) {
      throw new IllegalStateException(
          message
              + " currentStatus="
              + status
              + ", allowedStatuses="
              + Arrays.toString(allowedStatuses));
    }
  }

  private static void validateTimeline(
      PerformanceStatus status,
      OffsetDateTime preparedAt,
      OffsetDateTime startedAt,
      OffsetDateTime playbackFinishedAt,
      OffsetDateTime pausedAt) {
    switch (status) {
      case PREPARING -> {
        requireNull(startedAt, "PREPARING 상태에는 startedAt이 없어야 합니다.");
        requireNull(playbackFinishedAt, "PREPARING 상태에는 playbackFinishedAt이 없어야 합니다.");
        requireNull(pausedAt, "PREPARING 상태에는 pausedAt이 없어야 합니다.");
      }
      case PLAYING -> {
        Objects.requireNonNull(startedAt, "PLAYING 상태에는 startedAt이 필요합니다.");
        requireNull(playbackFinishedAt, "PLAYING 상태에는 playbackFinishedAt이 없어야 합니다.");
        requireTimeNotBefore(startedAt, preparedAt, "startedAt", "preparedAt");
        if (pausedAt != null) {
          requireTimeNotBefore(pausedAt, startedAt, "pausedAt", "startedAt");
        }
      }
      case ANALYZING, FINISHED, ANALYSIS_FAILED -> {
        Objects.requireNonNull(startedAt, status + " 상태에는 startedAt이 필요합니다.");
        Objects.requireNonNull(playbackFinishedAt, status + " 상태에는 playbackFinishedAt이 필요합니다.");
        requireNull(pausedAt, status + " 상태에는 pausedAt이 없어야 합니다.");
        requireTimeNotBefore(startedAt, preparedAt, "startedAt", "preparedAt");
        requireTimeNotBefore(playbackFinishedAt, startedAt, "playbackFinishedAt", "startedAt");
      }
      case CANCELLED -> {
        requireNull(playbackFinishedAt, "CANCELLED 상태에는 playbackFinishedAt이 없어야 합니다.");
        requireNull(pausedAt, "CANCELLED 상태에는 pausedAt이 없어야 합니다.");
        if (startedAt != null) {
          requireTimeNotBefore(startedAt, preparedAt, "startedAt", "preparedAt");
        }
      }
    }
  }

  private static void requirePositive(Long value, String fieldName) {
    if (value == null || value <= 0) {
      throw new IllegalArgumentException(fieldName + "은 양의 정수여야 합니다.");
    }
  }

  private static void requireNull(Object value, String message) {
    if (value != null) {
      throw new IllegalArgumentException(message);
    }
  }

  private static void requireTimeNotBefore(
      OffsetDateTime value, OffsetDateTime baseline, String fieldName, String baselineFieldName) {
    Objects.requireNonNull(value, fieldName + "은 필수입니다.");
    Objects.requireNonNull(baseline, baselineFieldName + "은 필수입니다.");
    if (value.isBefore(baseline)) {
      throw new IllegalArgumentException(fieldName + "은 " + baselineFieldName + "보다 이전일 수 없습니다.");
    }
  }
}
