package com.ssafy.ssasukae.domain.performanceResult.service;

import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryProperties;
import com.ssafy.ssasukae.domain.performance.redis.leaderboard.RoomLeaderboardEntry;
import com.ssafy.ssasukae.domain.performance.redis.leaderboard.RoomLeaderboardStore;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.service.PerformanceTransactionSupport;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventType;
import com.ssafy.ssasukae.domain.performance.websocket.payload.LeaderboardItemPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.LeaderboardUpdatedPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceStateChangedPayload;
import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultRequestDTO;
import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultResponseDTO;
import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;
import com.ssafy.ssasukae.domain.performanceResult.repository.PerformanceResultRepository;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.performanceAnalysis.PerformanceAnalysisErrorCode;
import com.ssafy.ssasukae.global.exception.song.SongErrorCode;
import com.ssafy.ssasukae.global.exception.user.UserErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;

@Service
@RequiredArgsConstructor
public class PerformanceResultService {

  private final UserRepository userRepository;
  private final SongRepository songRepository;
  private final PerformanceResultRepository performanceResultRepository;
  private final RoomRepository roomRepository;
  private final PerformanceStore performanceStore;
  private final RoomLeaderboardStore roomLeaderboardStore;
  private final PerformanceRecoveryProperties recoveryProperties;
  private final Clock clock;
  private final PerformanceTransactionSupport transactionSupport;
  private final PerformanceWebSocketEventPublisher eventPublisher;
  private final RoomParticipantRepository roomParticipantRepository;

  @Transactional
  public PerformanceResultResponseDTO.PerformanceIdDTO getScore(
      Long performanceId, PerformanceResultRequestDTO.ScoreDTO request) {
    validateRequest(performanceId, request);

    PerformanceSnapShot initial = getPerformance(performanceId);
    Room room = lockRoom(initial.roomId());
    PerformanceSnapShot analyzing = getAnalyzingPerformance(performanceId);

    validateRoomPlaying(room);
    validateAnalysisDeadline(analyzing);
    validatePerformanceContext(analyzing, request);

    User user =
        userRepository
            .findById(request.getUserId())
            .orElseThrow(() -> new CustomException(UserErrorCode.USER_NOT_FOUND));
    Song song =
        songRepository
            .findById(request.getSongId())
            .orElseThrow(() -> new CustomException(SongErrorCode.SONG_NOT_FOUND));

    PerformanceResult saved = performanceResultRepository.save(createResult(request, user, song));

    RoomLeaderboardEntry updatedEntry =
        new RoomLeaderboardEntry(
            analyzing.performanceId(),
            analyzing.performerParticipantId(),
            user.getNickname(),
            song.getId(),
            song.getTitle(),
            request.getFinalScore());
    Optional<RoomLeaderboardEntry> previousEntry =
        roomLeaderboardStore.find(room.getId(), analyzing.performanceId());
    List<RoomLeaderboardEntry> rankedEntries =
        roomLeaderboardStore.saveAndGetRanked(room.getId(), updatedEntry);

    transactionSupport.restoreOnRollback(
        () -> restoreLeaderboardEntry(room.getId(), analyzing.performanceId(), previousEntry));

    room.cancelPerformance();
    clearPerformer(room.getId(), analyzing.performerParticipantId());

    LeaderboardUpdatedPayload leaderboardPayload =
        new LeaderboardUpdatedPayload(
            analyzing.performanceId(), request.getFinalScore(), toPayload(rankedEntries));
    transactionSupport.afterCommit(
        () -> {
          transactionSupport.deletePerformance(analyzing);
          transactionSupport.deleteRecoveryDeadline(analyzing.performanceId());
          eventPublisher.publish(
              room.getId(), PerformanceWebSocketEventType.LEADERBOARD_UPDATED, leaderboardPayload);
          eventPublisher.publish(
              room.getId(),
              PerformanceWebSocketEventType.PERFORMANCE_STATE_CHANGED,
              new PerformanceStateChangedPayload(
                  performanceId, PerformanceStatus.ANALYZING, PerformanceStatus.FINISHED));
        });

    return PerformanceResultResponseDTO.PerformanceIdDTO.builder()
        .performanceId(saved.getId())
        .build();
  }

  private PerformanceResult createResult(
      PerformanceResultRequestDTO.ScoreDTO request, User user, Song song) {
    return PerformanceResult.builder()
        .user(user)
        .song(song)
        .pitchScore(request.getPitchScore())
        .lyricsScore(request.getLyricsScore())
        .rhythmScore(request.getRhythmScore())
        .stabilityScore(request.getStabilityScore())
        .finalScore(request.getFinalScore())
        .overall(request.getOverall())
        .strength(request.getStrength())
        .weakness(request.getWeakness())
        .tip(request.getTips())
        .build();
  }

  private PerformanceSnapShot getPerformance(Long performanceId) {
    return performanceStore
        .findByPerformanceId(performanceId)
        .orElseThrow(() -> new CustomException(PerformanceAnalysisErrorCode.RESOURCE_NOT_FOUND));
  }

  private PerformanceSnapShot getAnalyzingPerformance(Long performanceId) {
    PerformanceSnapShot performance = getPerformance(performanceId);
    if (performance.status() != PerformanceStatus.ANALYZING) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_PERFORMANCE_STATE);
    }
    return performance;
  }

  private Room lockRoom(Long roomId) {
    return roomRepository
        .findByIdForUpdate(roomId)
        .orElseThrow(() -> new CustomException(PerformanceAnalysisErrorCode.RESOURCE_NOT_FOUND));
  }

  private void validateRequest(Long performanceId, PerformanceResultRequestDTO.ScoreDTO request) {
    if (performanceId == null || performanceId <= 0 || request == null) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_REQUEST);
    }
  }

  private void validateRoomPlaying(Room room) {
    if (room.getStatus() != RoomStatus.PLAYING) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_ROOM_STATE);
    }
  }

  private void validateAnalysisDeadline(PerformanceSnapShot analyzing) {
    Instant deadline =
        analyzing.playbackFinishedAt().toInstant().plus(recoveryProperties.getAnalysisTimeout());
    if (!Instant.now(clock).isBefore(deadline)) {
      throw new CustomException(PerformanceAnalysisErrorCode.ANALYSIS_DEADLINE_EXPIRED);
    }
  }

  private void validatePerformanceContext(
      PerformanceSnapShot performance, PerformanceResultRequestDTO.ScoreDTO request) {
    if (!performance.performerUserId().equals(request.getUserId())
        || !performance.songId().equals(request.getSongId())) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_REQUEST);
    }
  }

  private void restoreLeaderboardEntry(
      Long roomId, Long performanceId, Optional<RoomLeaderboardEntry> previousEntry) {
    if (previousEntry.isPresent()) {
      roomLeaderboardStore.saveAndGetRanked(roomId, previousEntry.get());
      return;
    }
    roomLeaderboardStore.delete(roomId, performanceId);
  }

  private List<LeaderboardItemPayload> toPayload(List<RoomLeaderboardEntry> rankedEntries) {
    return IntStream.range(0, rankedEntries.size())
        .mapToObj(
            index -> {
              RoomLeaderboardEntry entry = rankedEntries.get(index);
              return new LeaderboardItemPayload(
                  index + 1,
                  entry.performanceId(),
                  entry.participantId(),
                  entry.nickname(),
                  entry.songId(),
                  entry.songTitle(),
                  entry.finalScore());
            })
        .toList();
  }
  private void clearPerformer(Long roomId, Long performerParticipantId) {
    roomParticipantRepository.findById(performerParticipantId)
            .filter(participant -> participant.getRoom().getId().equals(roomId))
            .filter(RoomParticipant::isActive)
            .ifPresent(RoomParticipant::demoteToParticipant);
  }
}
