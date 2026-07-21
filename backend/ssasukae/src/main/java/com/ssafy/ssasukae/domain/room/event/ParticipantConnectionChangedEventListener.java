package com.ssafy.ssasukae.domain.room.event;

import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class ParticipantConnectionChangedEventListener {

  private final RoomRealtimeEventPublisher roomRealtimeEventPublisher;

  public ParticipantConnectionChangedEventListener(
      RoomRealtimeEventPublisher roomRealtimeEventPublisher) {
    this.roomRealtimeEventPublisher = roomRealtimeEventPublisher;
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void handle(ParticipantConnectionChangedDomainEvent event) {
    roomRealtimeEventPublisher.publishRoomEvent(
        event.roomId(),
        event.version(),
        RealtimeEventType.PARTICIPANT_CONNECTION_CHANGED,
        new ParticipantConnectionChangedData(
            event.participantId(), event.connectionStatus()));

    if (event.hostChangedVersion() != null) {
      roomRealtimeEventPublisher.publishRoomEvent(
          event.roomId(),
          event.hostChangedVersion(),
          RealtimeEventType.HOST_CHANGED,
          new HostChangedData(event.newHostParticipantId()));
    }
  }
}
