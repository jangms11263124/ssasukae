package com.ssafy.ssasukae.domain.room.event;

import static org.mockito.Mockito.inOrder;

import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ParticipantConnectionChangedEventListenerTest {

  @Mock private RoomRealtimeEventPublisher publisher;

  @Test
  void publishesConnectionChangedThenHostChanged() {
    ParticipantConnectionChangedEventListener listener =
        new ParticipantConnectionChangedEventListener(publisher);

    listener.handle(
        new ParticipantConnectionChangedDomainEvent(
            10L,
            7L,
            101L,
            ConnectionStatus.DISCONNECTED,
            102L,
            8L));

    InOrder order = inOrder(publisher);
    order.verify(publisher)
        .publishRoomEvent(
            10L,
            7L,
            RealtimeEventType.PARTICIPANT_CONNECTION_CHANGED,
            new ParticipantConnectionChangedData(101L, ConnectionStatus.DISCONNECTED));
    order.verify(publisher)
        .publishRoomEvent(
            10L,
            8L,
            RealtimeEventType.HOST_CHANGED,
            new HostChangedData(102L));
  }

  @Test
  void doesNotPublishHostChangedForNormalParticipant() {
    ParticipantConnectionChangedEventListener listener =
        new ParticipantConnectionChangedEventListener(publisher);

    listener.handle(
        new ParticipantConnectionChangedDomainEvent(
            10L,
            7L,
            101L,
            ConnectionStatus.DISCONNECTED,
            null,
            null));

    org.mockito.Mockito.verify(publisher)
        .publishRoomEvent(
            10L,
            7L,
            RealtimeEventType.PARTICIPANT_CONNECTION_CHANGED,
            new ParticipantConnectionChangedData(101L, ConnectionStatus.DISCONNECTED));
    org.mockito.Mockito.verifyNoMoreInteractions(publisher);
  }
}
