package com.ssafy.ssasukae.domain.performance.service;

import org.springframework.stereotype.Component;

import com.ssafy.ssasukae.domain.card.service.CardService;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectEndReason;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.type.PerformanceCancelReason;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventType;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceCancelledPayload;
import com.ssafy.ssasukae.domain.room.entity.Room;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class PerformanceCancellationProcessor {

  private final PerformanceTransactionSupport transactionSupport;
  private final PerformanceWebSocketEventPublisher eventPublisher;
  private final CardService cardService;

  public void cancel(Room room, PerformanceSnapShot active, PerformanceCancelReason reason) {
    PerformanceSnapShot restored = cardService.closeForPerformance(active, CardEffectEndReason.PERFORMANCE_CANCELLED);
    PerformanceSnapShot cancelled = restored.cancel();

    transactionSupport.saveWithRollback(restored, cancelled);
    room.recoverPerformance();

    transactionSupport.afterCommit(
        () -> {
          transactionSupport.deletePerformance(cancelled);
          transactionSupport.deleteRecoveryDeadline(cancelled.performanceId());

          eventPublisher.publish(
              room.getId(),
              PerformanceWebSocketEventType.PERFORMANCE_CANCELLED,
              new PerformanceCancelledPayload(
                  cancelled.performanceId(),
                  cancelled.performerParticipantId(),
                  active.status(),
                  cancelled.status(),
                  room.getStatus(),
                  reason));
        });
  }
}
