package com.ssafy.ssasukae.domain.room.dto;

import java.time.OffsetDateTime;

import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;

/**
 * 공연 중 입장하거나 재접속한 클라이언트에게 전달하는 현재 음원 재생 상태.
 *
 * 서버가 매초 재생 위치를 저장하지 않고, 공연 시작 시각과 누적 정지 시간을 이용해 응답 시점의 재생 위치를 계산한다.
 */
public record PlaybackSnapshotResponse(

        // 현재 재생 중인 공연 ID
        Long performanceId,

        // 현재 음원 상태
        String playbackStatus,

        // 서버가 음원 재생 시작을 확정한 최초 시각
        OffsetDateTime playbackStartedAt,

        // serverNow 기준으로 계산한 현재 음원 재생 위치(ms)
        Long playbackPositionMs,

        // 연결 중단으로 음원이 정지했던 서버 기준 누적 시간(ms)
        Long accumulatedPausedDurationMs,

        // 전체 음원 길이(ms)
        Long songDurationMs) {

  /**
   * 공연 스냅샷을 클라이언트 재생 상태 응답으로 변환한다.
   *
   * @param performance Redis에 저장된 현재 공연 스냅샷
   * @param serverNow 응답을 생성하는 현재 서버 시각
   * @return 음원이 시작되지 않았다면 null, 시작됐다면 현재 재생 상태
   */
  public static PlaybackSnapshotResponse from(
          PerformanceSnapShot performance,
          OffsetDateTime serverNow) {

    // 아직 MR 재생이 시작되지 않은 공연에는 재생 상태가 없다.
    if (performance.startedAt() == null) {
      return null;
    }

    return new PlaybackSnapshotResponse(
            performance.performanceId(),

            performance.status().name().equals("SUSPENDED")
                    ? "SUSPENDED"
                    : performance.status().name().equals("ANALYZING")
                        ? "ANALYZING" : "PLAYING",

            performance.startedAt(),

            // 현재 위치 = 현재 서버 시각 - 재생 시작 시각 - 누적 연결 중단 시간
            performance.playbackPositionAt(serverNow),

            performance.accumulatedPausedDurationMs(),
            performance.songDurationMs());
  }
}
