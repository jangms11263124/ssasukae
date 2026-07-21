package com.ssafy.ssasukae.domain.performance.event;

import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class PerformanceStartedEventListener {

  private final RoomRealtimeEventPublisher roomRealtimeEventPublisher;

  public PerformanceStartedEventListener(
      RoomRealtimeEventPublisher roomRealtimeEventPublisher) {
    this.roomRealtimeEventPublisher = roomRealtimeEventPublisher;
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void handle(PerformanceStartedDomainEvent event) {
    roomRealtimeEventPublisher.publishRoomEvent(
        event.roomId(),
        event.roomVersion(),
        RealtimeEventType.PERFORMANCE_STARTED,
        new PerformanceStartedData(
            event.performanceId(),
            event.performerParticipantId(),
            event.songId(),
            event.roundNo(),
            event.status()));
  }
}
