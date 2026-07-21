package com.ssafy.ssasukae.domain.room.event;

import static org.mockito.Mockito.verify;

import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ParticipantMediaStateChangedEventListenerTest {

  @Mock private RoomRealtimeEventPublisher publisher;

  @Test
  void publishesParticipantMediaStateChangedEvent() {
    ParticipantMediaStateChangedEventListener listener =
        new ParticipantMediaStateChangedEventListener(publisher);
    ParticipantMediaStateChangedDomainEvent event =
        new ParticipantMediaStateChangedDomainEvent(10L, 4L, 102L, false, true);

    listener.handle(event);

    verify(publisher)
        .publishRoomEvent(
            10L,
            4L,
            RealtimeEventType.PARTICIPANT_MEDIA_STATE_CHANGED,
            new ParticipantMediaStateChangedData(102L, false, true));
  }
}
