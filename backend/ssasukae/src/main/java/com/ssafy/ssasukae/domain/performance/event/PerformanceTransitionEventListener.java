package com.ssafy.ssasukae.domain.performance.event;

import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class PerformanceTransitionEventListener {

  private final RoomRealtimeEventPublisher roomRealtimeEventPublisher;

  public PerformanceTransitionEventListener(
      RoomRealtimeEventPublisher roomRealtimeEventPublisher) {
    this.roomRealtimeEventPublisher = roomRealtimeEventPublisher;
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void handle(PerformanceTransitionDomainEvent event) {
    roomRealtimeEventPublisher.publishRoomEvent(
        event.roomId(),
        event.stateChangedRoomVersion(),
        RealtimeEventType.PERFORMANCE_STATE_CHANGED,
        new PerformanceStateChangedData(
            event.performanceId(),
            event.previousStatus(),
            event.currentStatus(),
            event.performanceVersion(),
            event.roomStatus(),
            event.changedAt()));

    switch (event.kind()) {
      case PLAYBACK_STARTED -> publishPlaybackStarted(event);
      case PLAYBACK_FINISHED -> publishPlaybackFinished(event);
      case PERFORMANCE_CANCELLED -> publishPerformanceCancelled(event);
    }
  }

  private void publishPlaybackStarted(PerformanceTransitionDomainEvent event) {
    roomRealtimeEventPublisher.publishRoomEvent(
        event.roomId(),
        event.specificRoomVersion(),
        RealtimeEventType.PLAYBACK_STARTED,
        new PlaybackStartedData(
            event.performanceId(),
            event.performerParticipantId(),
            event.currentStatus(),
            event.changedAt()));
  }

  private void publishPlaybackFinished(PerformanceTransitionDomainEvent event) {
    roomRealtimeEventPublisher.publishRoomEvent(
        event.roomId(),
        event.specificRoomVersion(),
        RealtimeEventType.PLAYBACK_FINISHED,
        new PlaybackFinishedData(
            event.performanceId(),
            event.performerParticipantId(),
            event.currentStatus(),
            event.changedAt()));
  }

  private void publishPerformanceCancelled(PerformanceTransitionDomainEvent event) {
    roomRealtimeEventPublisher.publishRoomEvent(
        event.roomId(),
        event.specificRoomVersion(),
        RealtimeEventType.PERFORMANCE_CANCELLED,
        new PerformanceCancelledData(
            event.performanceId(),
            event.performerParticipantId(),
            event.requestedByParticipantId(),
            event.currentStatus(),
            event.roomStatus(),
            event.changedAt()));
  }
}
