package com.ssafy.ssasukae.domain.performance.redis.performance;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Objects;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

@JsonIgnoreProperties(ignoreUnknown = true)
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
    // 연결 중단 시 서버에서 저장한 곡 재생 위치
    Long playbackPositionMs,
    PerformanceStatus suspendedFromStatus,
    OffsetDateTime suspendedAt) {

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
    validateTimeline(
        status,
        preparedAt,
        startedAt,
        playbackFinishedAt,
        suspendedFromStatus,
        suspendedAt);
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
        null,
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
        null,
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
    return copy(PerformanceStatus.PLAYING, settings, playbackStartedAt, null, 0L, 0L);
  }

  public PerformanceSnapShot finishPlayback(OffsetDateTime finishedAt) {
    requireStatus("재생 중인 공연만 정상 종료할 수 있습니다.", PerformanceStatus.PLAYING);
    requireTimeNotBefore(finishedAt, startedAt, "finishedAt", "startedAt");
    return copy(
        PerformanceStatus.ANALYZING,
        settings,
        startedAt,
        finishedAt,
        accumulatedPausedDurationMs,
        playbackPositionAt(finishedAt));
  }

  public PerformanceSnapShot suspendForPerformerDisconnect(OffsetDateTime at) {
    requireStatus(
        "가창자 연결 종료로 중단할 수 없는 공연 상태입니다.",
        PerformanceStatus.PREPARING,
        PerformanceStatus.PLAYING);
    Objects.requireNonNull(at, "suspendedAt은 필수입니다.");

    if (status == PerformanceStatus.PLAYING) {
      requireTimeNotBefore(at, startedAt, "suspendedAt", "startedAt");
    }

    return new PerformanceSnapShot(
        performanceId,
        roomId,
        performerParticipantId,
        performerUserId,
        songId,
        PerformanceStatus.SUSPENDED,
        settings,
        preparedAt,
        startedAt,
        playbackFinishedAt,
        songDurationMs,
        accumulatedPausedDurationMs,
        status == PerformanceStatus.PLAYING ? playbackPositionAt(at) : 0L,
        status,
        at);
  }

  public PerformanceSnapShot resumeAfterPerformerReconnect(OffsetDateTime at) {
    requireStatus("중단된 공연만 재개할 수 있습니다.", PerformanceStatus.SUSPENDED);
    Objects.requireNonNull(suspendedFromStatus, "중단 이전 공연 상태가 필요합니다.");
    requireTimeNotBefore(at, suspendedAt, "resumedAt", "suspendedAt");

    long suspensionMillis = Math.max(0L, Duration.between(suspendedAt, at).toMillis());
    return new PerformanceSnapShot(
        performanceId,
        roomId,
        performerParticipantId,
        performerUserId,
        songId,
        suspendedFromStatus,
        settings,
        preparedAt,
        startedAt,
        playbackFinishedAt,
        songDurationMs,
        suspendedFromStatus == PerformanceStatus.PLAYING
            ? accumulatedPausedDurationMs + suspensionMillis
            : accumulatedPausedDurationMs,
        playbackPositionMs,
        null,
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
        playbackPositionMs);
  }



  public long playbackPositionAt(OffsetDateTime at) {
    if (startedAt == null) {
      return 0L;
    }
    if (status == PerformanceStatus.SUSPENDED) {
      return clampPosition(playbackPositionMs);
    }
    long elapsed = Math.max(0L, Duration.between(startedAt, at).toMillis());
    return clampPosition(elapsed - accumulatedPausedDurationMs);
  }

  public long remainingPlaybackMs(OffsetDateTime at) {
    return Math.max(0L, songDurationMs - playbackPositionAt(at));
  }

  public boolean belongsToRoom(Long requestedRoomId) {
    return roomId.equals(requestedRoomId);
  }

  public boolean isPerformedBy(Long participantId) {
    return performerParticipantId.equals(participantId);
  }

  private PerformanceSnapShot copy(
      PerformanceStatus changedStatus,
      PerformanceSettings changedSettings,
      OffsetDateTime changedStartedAt,
      OffsetDateTime changedFinishedAt,
      Long changedAccumulatedPausedDurationMs,
      Long changedPlaybackPositionMs) {
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
        suspendedFromStatus,
        suspendedAt);
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
      PerformanceStatus suspendedFromStatus,
      OffsetDateTime suspendedAt) {
    switch (status) {
      case PREPARING -> {
        requireNull(startedAt, "PREPARING 상태에는 startedAt이 없어야 합니다.");
        requireNull(playbackFinishedAt, "PREPARING 상태에는 playbackFinishedAt이 없어야 합니다.");
      }
      case PLAYING -> {
        Objects.requireNonNull(startedAt, "PLAYING 상태에는 startedAt이 필요합니다.");
        requireNull(playbackFinishedAt, "PLAYING 상태에는 playbackFinishedAt이 없어야 합니다.");
        requireTimeNotBefore(startedAt, preparedAt, "startedAt", "preparedAt");
      }
      case ANALYZING-> {
        Objects.requireNonNull(startedAt, status + " 상태에는 startedAt이 필요합니다.");
        Objects.requireNonNull(playbackFinishedAt, status + " 상태에는 playbackFinishedAt이 필요합니다.");
        requireTimeNotBefore(startedAt, preparedAt, "startedAt", "preparedAt");
        requireTimeNotBefore(playbackFinishedAt, startedAt, "playbackFinishedAt", "startedAt");
      }
      case SUSPENDED -> {
        Objects.requireNonNull(suspendedFromStatus, "중단 이전 공연 상태가 필요합니다.");
        Objects.requireNonNull(suspendedAt, "공연 중단 시각이 필요합니다.");
        if (suspendedFromStatus != PerformanceStatus.PREPARING
            && suspendedFromStatus != PerformanceStatus.PLAYING) {
          throw new IllegalArgumentException("중단 이전 상태는 PREPARING 또는 PLAYING이어야 합니다.");
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
