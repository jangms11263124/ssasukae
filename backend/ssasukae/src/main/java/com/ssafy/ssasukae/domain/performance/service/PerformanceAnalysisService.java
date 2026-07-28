package com.ssafy.ssasukae.domain.performance.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ssafy.ssasukae.domain.performance.redis.leaderboard.RoomLeaderboardEntry;
import com.ssafy.ssasukae.domain.performance.redis.leaderboard.RoomLeaderboardStore;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.rest.request.AiAnalysisFailureRequest;
import com.ssafy.ssasukae.domain.performance.rest.request.AiAnalysisSuccessRequest;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventType;
import com.ssafy.ssasukae.domain.performance.websocket.payload.LeaderboardItemPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.LeaderboardUpdatedPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceStateChangedPayload;
import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;
import com.ssafy.ssasukae.domain.performanceResult.repository.PerformanceResultRepository;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.performanceAnalysis.PerformanceAnalysisErrorCode;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class PerformanceAnalysisService {

  private static final BigDecimal MIN_SCORE = BigDecimal.ZERO;
  private static final BigDecimal MAX_SCORE = BigDecimal.valueOf(100);
  private static final int MAX_SCORE_SCALE = 2;
  private static final int MAX_FEEDBACK_LENGTH = 5000;

  private final RoomRepository roomRepository;
  private final SongRepository songRepository;
  private final UserRepository userRepository;
  private final PerformanceStore performanceStore;
  private final PerformanceTransactionSupport transactionSupport;
  private final RoomLeaderboardStore roomLeaderboardStore;
  private final PerformanceResultRepository performanceResultRepository;
  private final PerformanceWebSocketEventPublisher eventPublisher;

  // ai 서버에서 정상적인 점수 결과를 제공 받은 경우
  @Transactional
  public void completeAnalysis(Long performanceId, AiAnalysisSuccessRequest request) {
    validateSuccessRequest(performanceId, request);

    // 현 공연 상태를 가져옴
    PerformanceSnapShot initial = getSnapShot(performanceId);
    // 방 정보 디비 락 걸고 가져오기 -> completeAnlysis 메서드 끝날 때까지 락
    Room room = lockRoom(initial.roomId());

    // 만약에 동시에 요청이 들어왔을 때, 앞선 요청의 락이 풀리고 나서, 대기하는 중
    // 그러다가 앞선 요청에서 공연 분석 종료를 하고 공연을 끝내면, 여기서 두번째 요청은 그대로 종료함
    PerformanceSnapShot analyzing = getAnalyzingSnapShot(performanceId);
    validateRoomPlaying(room);

    /**
     * 사용자, 노래 정합성 검사
     */
    User performer =
        userRepository
            .findById(analyzing.performerUserId())
            .orElseThrow(() -> new CustomException(PerformanceAnalysisErrorCode.RESOURCE_NOT_FOUND));
    Song song =
        songRepository
            .findById(analyzing.songId())
            .orElseThrow(() -> new CustomException(PerformanceAnalysisErrorCode.RESOURCE_NOT_FOUND));

    // 공연 결과 저장
    PerformanceResult result =
        performanceResultRepository.save(
            PerformanceResult.create(
                song,
                performer,
                request.pitchScore(),
                request.rhythmScore(),
                request.lyricsScore(),
                request.stabilityScore(),
                request.finalScore()));

    // 리더보드에 넣을 엔트리 생성
    RoomLeaderboardEntry updatedEntry =
        new RoomLeaderboardEntry(
            performanceId,
            analyzing.performerParticipantId(),
            performer.getNickname(),
            song.getId(),
            song.getTitle(),
            request.finalScore());

    // 엔트리를 레디스에 저장하고, 리더보드 갱신
    List<RoomLeaderboardEntry> rankedEntries = roomLeaderboardStore.saveAndGetRanked(room.getId(), updatedEntry);
    // 만약에 도중에 DB 롤백될 경우에는 엔트리 제거
    transactionSupport.restoreOnRollback(() -> roomLeaderboardStore.delete(room.getId(), performanceId));
    PerformanceSnapShot finished;
    try {
      // 공연 상태 종료로 설정
      finished = analyzing.completeAnalysis();
    } catch (IllegalStateException exception) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_PERFORMANCE_STATE);
    }
    // 레디스에 저장
    transactionSupport.saveWithRollback(analyzing, finished);

    // 방 상태 PREPARE로 변경
    room.cancelPerformance();

    // 페이로드에 리더보드 정보 넣기
    LeaderboardUpdatedPayload leaderboardPayload = new LeaderboardUpdatedPayload(performanceId, request.finalScore(), toPayload(rankedEntries));

    // completeAnalysis 로직이 성공적으로 끝나면 끝난 공연은 삭제하고 리더보드 쏴줌
    transactionSupport.afterCommit(
        () -> {
          // 공연 삭제
          transactionSupport.deletePerformance(finished);

          // 새로운 리더보드 이벤트 발행
          eventPublisher.publish(
              room.getId(), PerformanceWebSocketEventType.LEADERBOARD_UPDATED, leaderboardPayload);

          // 공연 상태 변경 이벤트 발행
          eventPublisher.publish(
              room.getId(),
              PerformanceWebSocketEventType.PERFORMANCE_STATE_CHANGED,
              new PerformanceStateChangedPayload(
                  performanceId, PerformanceStatus.ANALYZING, PerformanceStatus.FINISHED));
        });
  }

  // ai 서버에서 비정상적인 점수 결과를 제공 받은 경우
  @Transactional
  public void failAnalysis(Long performanceId, AiAnalysisFailureRequest request) {
    validateFailureRequest(performanceId, request);

    PerformanceSnapShot initial = getSnapShot(performanceId);
    Room room = lockRoom(initial.roomId());

    PerformanceSnapShot analyzing = getAnalyzingSnapShot(performanceId);
    validateRoomPlaying(room);

    PerformanceSnapShot failed;
    try {
      failed = analyzing.failAnalysis();
    } catch (IllegalStateException exception) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_PERFORMANCE_STATE);
    }

    // AI 분석 실패 정보 저장
    transactionSupport.saveWithRollback(analyzing, failed);
    room.cancelPerformance();

    // 공연 삭제 후 공연 상태 변경 이벤트 발행
    transactionSupport.afterCommit(
        () -> {
          transactionSupport.deletePerformance(failed);
          eventPublisher.publish(
              room.getId(),
              PerformanceWebSocketEventType.PERFORMANCE_STATE_CHANGED,
              new PerformanceStateChangedPayload(
                  performanceId, PerformanceStatus.ANALYZING, PerformanceStatus.ANALYSIS_FAILED));
        });
  }

  // 공연 스냅샷 아이디를 기반으로 공연 정보 가져오기
  private PerformanceSnapShot getSnapShot(Long performanceId) {
    return performanceStore
        .findByPerformanceId(performanceId)
        .orElseThrow(() -> new CustomException(PerformanceAnalysisErrorCode.RESOURCE_NOT_FOUND));
  }

  private PerformanceSnapShot getAnalyzingSnapShot(Long performanceId) {
    PerformanceSnapShot snapShot = getSnapShot(performanceId);

    if (snapShot.status() != PerformanceStatus.ANALYZING) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_PERFORMANCE_STATE);
    }

    return snapShot;
  }

  private Room lockRoom(Long roomId) {
    return roomRepository
        .findByIdForUpdate(roomId)
        .orElseThrow(() -> new CustomException(PerformanceAnalysisErrorCode.RESOURCE_NOT_FOUND));
  }

  private void validateRoomPlaying(Room room) {
    if (room.getStatus() != RoomStatus.PLAYING) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_ROOM_STATE);
    }
  }

  private void validateSuccessRequest(Long performanceId, AiAnalysisSuccessRequest request) {
    validatePositive(performanceId);
    if (request == null) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_REQUEST);
    }

    validateScore(request.pitchScore());
    validateScore(request.rhythmScore());
    validateScore(request.lyricsScore());
    if (request.stabilityScore() != null) {
      validateScore(request.stabilityScore());
    }
    validateScore(request.finalScore());
  }

  private void validateFailureRequest(Long performanceId, AiAnalysisFailureRequest request) {
    validatePositive(performanceId);
    if (request == null) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_REQUEST);
    }
  }

  private void validatePositive(Long performanceId) {
    if (performanceId == null || performanceId <= 0) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_REQUEST);
    }
  }

  private void validateScore(BigDecimal score) {
    if (score == null
        || score.compareTo(MIN_SCORE) < 0
        || score.compareTo(MAX_SCORE) > 0
        || score.stripTrailingZeros().scale() > MAX_SCORE_SCALE) {
      throw new CustomException(PerformanceAnalysisErrorCode.INVALID_SCORE_RANGE);
    }
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
}
