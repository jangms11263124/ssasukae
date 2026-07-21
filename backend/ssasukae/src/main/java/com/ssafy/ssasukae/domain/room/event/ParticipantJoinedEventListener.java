package com.ssafy.ssasukae.domain.room.event;

import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class ParticipantJoinedEventListener {

  private final RoomRealtimeEventPublisher roomRealtimeEventPublisher;

  public ParticipantJoinedEventListener(
      RoomRealtimeEventPublisher roomRealtimeEventPublisher) {
    this.roomRealtimeEventPublisher = roomRealtimeEventPublisher;
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void handle(ParticipantJoinedDomainEvent event) {
    roomRealtimeEventPublisher.publishRoomEvent(
        event.roomId(),
        event.version(),
        RealtimeEventType.PARTICIPANT_JOINED,
        new ParticipantJoinedData(
            event.participantId(), event.nickname(), event.participantCount()));
  }
}
