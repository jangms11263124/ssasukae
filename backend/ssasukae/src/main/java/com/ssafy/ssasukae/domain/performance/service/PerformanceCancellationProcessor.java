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

    room.recoverPerformance();
    clearPerformer(room.getId(), restored.performerParticipantId());
    transactionSupport.afterCommit(
        () -> {
          transactionSupport.deletePerformance(restored);
          transactionSupport.deleteRecoveryDeadline(restored.performanceId());

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
