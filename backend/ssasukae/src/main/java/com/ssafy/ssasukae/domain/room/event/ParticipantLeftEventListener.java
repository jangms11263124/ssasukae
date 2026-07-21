package com.ssafy.ssasukae.domain.room.event;

import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class ParticipantLeftEventListener {

  private final RoomRealtimeEventPublisher roomRealtimeEventPublisher;

  public ParticipantLeftEventListener(RoomRealtimeEventPublisher roomRealtimeEventPublisher) {
    this.roomRealtimeEventPublisher = roomRealtimeEventPublisher;
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void handle(ParticipantLeftDomainEvent event) {
    roomRealtimeEventPublisher.publishRoomEvent(
        event.roomId(),
        event.participantLeftVersion(),
        RealtimeEventType.PARTICIPANT_LEFT,
        new ParticipantLeftData(
            event.participantId(),
            event.participantCount(),
            event.hostParticipantId(),
            event.reason()));

    if (event.hostChangedVersion() != null && event.hostParticipantId() != null) {
      roomRealtimeEventPublisher.publishRoomEvent(
          event.roomId(),
          event.hostChangedVersion(),
          RealtimeEventType.HOST_CHANGED,
          new HostChangedData(event.hostParticipantId()));
    }
  }
}
