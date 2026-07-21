package com.ssafy.ssasukae.domain.performance.event;

import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class PerformanceSettingsChangedEventListener {

  private final RoomRealtimeEventPublisher roomRealtimeEventPublisher;

  public PerformanceSettingsChangedEventListener(
      RoomRealtimeEventPublisher roomRealtimeEventPublisher) {
    this.roomRealtimeEventPublisher = roomRealtimeEventPublisher;
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void handle(PerformanceSettingsChangedDomainEvent event) {
    roomRealtimeEventPublisher.publishRoomEvent(
        event.roomId(),
        event.roomVersion(),
        RealtimeEventType.PERFORMANCE_SETTINGS_CHANGED,
        new PerformanceSettingsChangedData(
            event.performanceId(),
            event.changedByParticipantId(),
            event.source(),
            event.settingsVersion(),
            event.keyOffset(),
            event.tempoPercent(),
            event.mrVolumePercent(),
            event.micVolumePercent(),
            event.echoLevel(),
            event.reverbLevel()));
  }
}
