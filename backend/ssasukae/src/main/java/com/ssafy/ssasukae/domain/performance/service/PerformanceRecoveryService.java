package com.ssafy.ssasukae.domain.performance.service;

import java.time.Instant;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryDeadlineStore;
import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryProperties;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.type.PerformanceCancelReason;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventType;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceStateChangedPayload;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class PerformanceRecoveryService {

  private final RoomRepository roomRepository;
  private final PerformanceStore performanceStore;
  private final PerformanceRecoveryDeadlineStore deadlineStore;
  private final PerformanceRecoveryProperties properties;
  private final PerformanceTransactionSupport transactionSupport;
  private final PerformanceCancellationProcessor cancellationProcessor;
  private final PerformanceWebSocketEventPublisher eventPublisher;

  /**
   *  명시적으로 방을 나간 사용자가 현재 가창자라면 재생 전 또는 재생 중인 공연을 즉시 취소한다.
   */
  @Transactional
  public void recoverPerformerExitCase(Long roomId, Long userId) {
    if (!isPositive(roomId) || !isPositive(userId)) {
      return;
    }

    Room room = lockRoom(roomId).orElse(null);
    if (room == null) {
      return;
    }

    PerformanceSnapShot active = performanceStore.findActiveByRoomId(roomId).orElse(null);
    if (active == null
        || !active.performerUserId().equals(userId)
        || active.status() == PerformanceStatus.ANALYZING) {
      return;
    }

    cancellationProcessor.cancel(
        room, active, PerformanceCancelReason.PERFORMER_DISCONNECTED);
  }

  /**
   * Redis 마감 시각이 지난 공연을 현재 상태에 맞게 복구한다.
   * ANALYZING 상태에서 AI 응답 제한 시간이 실제로 지난 경우 분석 실패로 종료한다.
   */
  @Transactional
  public void recoverExpired(Long performanceId, Instant now) {
    if (!isPositive(performanceId) || now == null) {
      return;
    }

    // 공연 정보가 없으면 공연 복구 정보도 삭제
    PerformanceSnapShot initial = performanceStore.findByPerformanceId(performanceId).orElse(null);
    if (initial == null) {
      deadlineStore.delete(performanceId);
      return;
    }

    // 락
    Room room = lockRoom(initial.roomId()).orElse(null);
    if (room == null) {
      cleanup(initial);
      return;
    }

    // 현재 공연 상태 조회 -> 공연 정보 없거나 방 정보 정합성 안맞으면 공연 복구 정보 제거
    PerformanceSnapShot current = performanceStore.findByPerformanceId(performanceId).orElse(null);
    if (current == null || !current.belongsToRoom(room.getId())) {
      deadlineStore.delete(performanceId);
      return;
    }
    // 방이 제거됐거나, 방 상태가 PLAYING이 아니면 공연 복구 정보 삭제
    if (current.isTerminal() || room.getStatus() != RoomStatus.PLAYING) {
      cleanup(current);
      return;
    }
    // 현재 분석중이라면 복구 정보 저장
    if (current.status() == PerformanceStatus.ANALYZING) {
      recoverAnalysisTimeout(room, current, now);
      return;
    }

    deadlineStore.delete(performanceId);
  }


  // 분석 타임아웃 설정 후 레디스에 저장
  private void recoverAnalysisTimeout(
      Room room, PerformanceSnapShot analyzing, Instant currentTime) {
    // 타임아웃은, 음원 종료 시각 기준 +2분으로 잡음
    Instant analysisDeadline =
        analyzing.playbackFinishedAt().toInstant().plus(properties.getAnalysisTimeout());

    //  만약 현재 시각이 타임아웃시각보다 앞이라면 레디스에다가 저장
    if (currentTime.isBefore(analysisDeadline)) {
      deadlineStore.save(analyzing.performanceId(), analysisDeadline);
      return;
    }

    // 현재 시각이 타임아웃시간보다 뒤다 -> 타임아웃 오버됐다. -> 공연 강제 종료 시켜야함
    PerformanceSnapShot failed = analyzing.failAnalysis();
    // 현재 공연 상태를 분석 실패처리
    transactionSupport.saveWithRollback(analyzing, failed);
    // 방 상태를 PREPARE로 복구 -> 다음 곡 준비를 위해
    room.recoverPerformance();

    transactionSupport.afterCommit(
        () -> {
          // 공연 정보와 복구 정보 삭제
          cleanup(failed);

          // 공연 상태가 변경되었으니 이벤트 발행 (분석중 -> 분석 실패)
          eventPublisher.publish(
              room.getId(),
              PerformanceWebSocketEventType.PERFORMANCE_STATE_CHANGED,
              new PerformanceStateChangedPayload(
                  failed.performanceId(),
                  PerformanceStatus.ANALYZING,
                  PerformanceStatus.ANALYSIS_FAILED));
        });
  }

  // 공연 정보와 복구 정보를 레디스에서 삭제
  private void cleanup(PerformanceSnapShot snapShot) {
    transactionSupport.deletePerformance(snapShot);
    transactionSupport.deleteRecoveryDeadline(snapShot.performanceId());
  }

  private Optional<Room> lockRoom(Long roomId) {
    return roomRepository.findByIdForUpdate(roomId);
  }

  private boolean isPositive(Long value) {
    return value != null && value > 0;
  }
}
