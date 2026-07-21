package com.ssafy.ssasukae.domain.room.event;

import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class ParticipantMediaStateChangedEventListener {

  private final RoomRealtimeEventPublisher roomRealtimeEventPublisher;

  public ParticipantMediaStateChangedEventListener(
      RoomRealtimeEventPublisher roomRealtimeEventPublisher) {
    this.roomRealtimeEventPublisher = roomRealtimeEventPublisher;
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void handle(ParticipantMediaStateChangedDomainEvent event) {
    roomRealtimeEventPublisher.publishRoomEvent(
        event.roomId(),
        event.version(),
        RealtimeEventType.PARTICIPANT_MEDIA_STATE_CHANGED,
        new ParticipantMediaStateChangedData(
            event.participantId(), event.micEnabled(), event.cameraEnabled()));
  }
}
