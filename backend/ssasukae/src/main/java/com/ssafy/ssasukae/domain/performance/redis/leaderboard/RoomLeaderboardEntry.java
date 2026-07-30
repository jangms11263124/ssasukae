package com.ssafy.ssasukae.domain.performance.redis.leaderboard;

import java.math.BigDecimal;
import java.util.Objects;

public record RoomLeaderboardEntry(
    Long performanceId,
    Long participantId,
    String nickname,
    Long songId,
    String songTitle,
    Integer finalScore) {

  public RoomLeaderboardEntry {
    requirePositive(performanceId, "performanceId");
    requirePositive(participantId, "participantId");
    requirePositive(songId, "songId");
    Objects.requireNonNull(nickname, "nickname은 필수입니다.");
    Objects.requireNonNull(songTitle, "songTitle은 필수입니다.");
    Objects.requireNonNull(finalScore, "finalScore는 필수입니다.");
  }

  private static void requirePositive(Long value, String fieldName) {
    if (value == null || value <= 0) {
      throw new IllegalArgumentException(fieldName + "는 양의 정수여야 합니다.");
    }
  }
}
