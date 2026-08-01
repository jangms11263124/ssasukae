package com.ssafy.ssasukae.domain.room.dto;

import java.time.OffsetDateTime;

import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSettings;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.song.entity.Song;

public record PerformanceSnapshotResponse(
    Long performanceId,
    PerformanceStatus status,
    PerformanceStatus suspendedFromStatus,
    Long performerParticipantId,
    Long songId,
    String songTitle,
    String artist,
    Integer difficultyLevel,
    String thumbnailImageUrl,
    PerformanceSettings settings,
    OffsetDateTime preparedAt,
    OffsetDateTime startedAt,
    OffsetDateTime suspendedAt,
    Long playbackPositionMs,
    Long songDurationMs,
    String mrDownloadUrl,
    String midiJsonDownloadUrl,
    String lyricsDownloadUrl) {

  public static PerformanceSnapshotResponse from(
      PerformanceSnapShot performance,
      Song song,
      OffsetDateTime serverNow,
      String mrDownloadUrl,
      String midiJsonDownloadUrl,
      String lyricsDownloadUrl) {
    return new PerformanceSnapshotResponse(
        performance.performanceId(),
        performance.status(),
        performance.suspendedFromStatus(),
        performance.performerParticipantId(),
        performance.songId(),
        song.getTitle(),
        song.getArtist(),
        song.getDifficultyLevel(),
        song.getThumbnailImageUrl(),
        performance.settings(),
        performance.preparedAt(),
        performance.startedAt(),
        performance.suspendedAt(),
        performance.playbackPositionAt(serverNow),
        performance.songDurationMs(),
        mrDownloadUrl,
        midiJsonDownloadUrl,
        lyricsDownloadUrl);
  }
}
