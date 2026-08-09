package com.ssafy.ssasukae.domain.performance.service;

import java.util.concurrent.ThreadLocalRandom;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultRequestDTO;
import com.ssafy.ssasukae.domain.performanceResult.service.PerformanceResultService;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.performanceAnalysis.PerformanceAnalysisErrorCode;

import lombok.RequiredArgsConstructor;

/** 시연용 데모 채점. AI 응답 대신 고정 범위 점수를 즉시 반영한다. */
@Service
@RequiredArgsConstructor
public class PerformanceDemoService {

  private final PerformanceStore performanceStore;
  private final RoomRepository roomRepository;
  private final PerformanceResultService performanceResultService;

  @Transactional
  public void submitDemoScore(Long userId, Long performanceId) {
    if (userId == null || userId <= 0 || performanceId == null || performanceId <= 0) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_REQUEST);
    }

    PerformanceSnapShot initial =
        performanceStore
            .findByPerformanceId(performanceId)
            .orElseThrow(
                () -> new CustomException(PerformanceAnalysisErrorCode.RESOURCE_NOT_FOUND));
    Room room =
        roomRepository
            .findByIdForUpdate(initial.roomId())
            .orElseThrow(
                () -> new CustomException(PerformanceAnalysisErrorCode.RESOURCE_NOT_FOUND));

    PerformanceSnapShot current = performanceStore.findByPerformanceId(performanceId).orElse(null);
    if (current == null || !current.belongsToRoom(room.getId())) {
      throw new CustomException(PerformanceAnalysisErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!current.performerUserId().equals(userId)) {
      throw new CustomException(PerformanceAnalysisErrorCode.PERFORMER_ONLY);
    }
    if (current.status() != PerformanceStatus.ANALYZING) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_PERFORMANCE_STATE);
    }
    if (room.getStatus() != RoomStatus.PLAYING) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_ROOM_STATE);
    }

    int finalScore = ThreadLocalRandom.current().nextInt(88, 101);

    PerformanceResultRequestDTO.ScoreDTO request =
        PerformanceResultRequestDTO.ScoreDTO.builder()
            .userId(current.performerUserId())
            .songId(current.songId())
            .pitchScore(finalScore)
            .rhythmScore(finalScore)
            .lyricsScore(finalScore)
            .stabilityScore(finalScore)
            .finalScore(finalScore)
            .overall("시연용 데모 채점")
            .strength("데모")
            .weakness("데모")
            .tips("데모")
            .build();

    performanceResultService.getScore(performanceId, request);
  }
}
