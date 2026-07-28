package com.ssafy.ssasukae.domain.performance.redis.leaderboard;

import java.util.List;
import java.util.Optional;

public interface RoomLeaderboardStore {

  Optional<RoomLeaderboardEntry> find(Long roomId, Long performanceId);

  List<RoomLeaderboardEntry> saveAndGetRanked(Long roomId, RoomLeaderboardEntry entry);

  void delete(Long roomId, Long performanceId);
}
