package com.ssafy.ssasukae.domain.performance.service;

import com.ssafy.ssasukae.domain.card.service.CardService;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectEndReason;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.type.PerformanceCancelReason;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventType;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceCancelledPayload;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PerformanceCancellationProcessor {

  private final PerformanceTransactionSupport transactionSupport;
  private final PerformanceWebSocketEventPublisher eventPublisher;
  private final CardService cardService;
  private final RoomParticipantRepository roomParticipantRepository;

  public void cancel(Room room, PerformanceSnapShot active, PerformanceCancelReason reason) {
    PerformanceSnapShot restored = cardService.closeForPerformance(active, CardEffectEndReason.PERFORMANCE_CANCELLED);

    // 시작 전(노래 바꾸기) cancel은 공연 세션만 폐기하고 가창자 역할은 유지한다.
    // 공연 중 취소·연결 끊김 등은 역할을 내려 다음 라운드를 처음부터 고른다.
    boolean keepPerformer =
        active.status() == PerformanceStatus.PREPARING
            && reason == PerformanceCancelReason.PERFORMER_REQUEST;

    room.recoverPerformance();
    if (!keepPerformer) {
      clearPerformer(room.getId(), restored.performerParticipantId());
    }
    transactionSupport.afterCommit(
        () -> {
          transactionSupport.deletePerformance(restored);
          if (active.status() == PerformanceStatus.ANALYZING) {
            transactionSupport.deleteRecoveryDeadline(restored.performanceId());
          }

          eventPublisher.publish(
              room.getId(),
              PerformanceWebSocketEventType.PERFORMANCE_CANCELLED,
              new PerformanceCancelledPayload(
                      restored.performanceId(),
                      restored.performerParticipantId(),
                      active.status(),
                      PerformanceStatus.CANCELLED,
                      room.getStatus(),
                      reason));
        });
  }

  private void clearPerformer(Long roomId, Long performerParticipantId) {
    roomParticipantRepository.findById(performerParticipantId)
        .filter(participant -> participant.getRoom().getId().equals(roomId))
        .filter(RoomParticipant::isActive)
        .ifPresent(RoomParticipant::demoteToParticipant);
  }
}
