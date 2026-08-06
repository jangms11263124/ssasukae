package com.ssafy.ssasukae.domain.room.dto;

import com.ssafy.ssasukae.domain.performance.redis.leaderboard.RoomLeaderboardEntry;

public record LeaderboardSnapshotResponse(
    Integer rank,
    Long performanceId,
    Long participantId,
    String nickname,
    Long songId,
    String songTitle,
    Integer finalScore) {

  public static LeaderboardSnapshotResponse from(RoomLeaderboardEntry entry, int rank) {
    return new LeaderboardSnapshotResponse(
        rank,
        entry.performanceId(),
        entry.participantId(),
        entry.nickname(),
        entry.songId(),
        entry.songTitle(),
        entry.finalScore());
  }
}
