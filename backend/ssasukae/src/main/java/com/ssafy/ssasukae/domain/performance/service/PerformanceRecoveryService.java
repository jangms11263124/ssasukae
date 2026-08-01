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
    recoverPerformerExitCase(roomId, userId, PerformanceCancelReason.PERFORMER_DISCONNECTED);
  }

  @Transactional
  public void recoverPerformerExitCase(
      Long roomId, Long userId, PerformanceCancelReason cancelReason) {
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
        room,
        active,
        cancelReason == null ? PerformanceCancelReason.SAFETY_TERMINATION : cancelReason);
  }

  /**
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
    // 방 상태가 PLAYING이 아니면 공연 복구 정보 삭제
    if (room.getStatus() != RoomStatus.PLAYING) {
      cleanup(current);
      return;
    }
    // 현재 분석중이라면 복구 정보 저장
    if (current.status() == PerformanceStatus.ANALYZING) {
      failAnalysis(room, current);
      return;
    }

    if (current.status() == PerformanceStatus.SUSPENDED) {
      cancellationProcessor.cancel(
          room, current, PerformanceCancelReason.PERFORMER_DISCONNECTED);
      return;
    }

    deadlineStore.delete(performanceId);
  }


  // 분석 실패 처리
  private void failAnalysis(Room room, PerformanceSnapShot analyzing) {
    room.recoverPerformance();

    transactionSupport.afterCommit(() -> {
      cleanup(analyzing);
      eventPublisher.publish(
              room.getId(),
              PerformanceWebSocketEventType.PERFORMANCE_STATE_CHANGED,
              new PerformanceStateChangedPayload(
                      analyzing.performanceId(),
                      PerformanceStatus.ANALYZING,
                      PerformanceStatus.ANALYSIS_FAILED
              )
      );
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
