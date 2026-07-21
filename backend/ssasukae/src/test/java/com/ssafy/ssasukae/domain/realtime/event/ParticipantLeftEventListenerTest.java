package com.ssafy.ssasukae.domain.realtime.event;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;
import com.ssafy.ssasukae.domain.room.event.HostChangedData;import com.ssafy.ssasukae.domain.room.event.ParticipantLeftData;import com.ssafy.ssasukae.domain.room.event.ParticipantLeftDomainEvent;import com.ssafy.ssasukae.domain.room.event.ParticipantLeftEventListener;import com.ssafy.ssasukae.domain.room.type.ParticipantLeaveReason;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ParticipantLeftEventListenerTest {

  @Mock private RoomRealtimeEventPublisher publisher;

  @Test
  void publishesParticipantLeftBeforeHostChangedWithDifferentVersions() {
    ParticipantLeftEventListener listener = new ParticipantLeftEventListener(publisher);
    ParticipantLeftDomainEvent event =
        new ParticipantLeftDomainEvent(
            10L, 8L, 101L, 2, 102L, ParticipantLeaveReason.LEFT, 9L);

    listener.handle(event);

    InOrder order = inOrder(publisher);
    order.verify(publisher)
        .publishRoomEvent(
            10L,
            8L,
            RealtimeEventType.PARTICIPANT_LEFT,
            new ParticipantLeftData(101L, 2, 102L, ParticipantLeaveReason.LEFT));
    order.verify(publisher)
        .publishRoomEvent(
            10L,
            9L,
            RealtimeEventType.HOST_CHANGED,
            new HostChangedData(102L));
  }

  @Test
  void publishesOnlyParticipantLeftWhenHostDoesNotChange() {
    ParticipantLeftEventListener listener = new ParticipantLeftEventListener(publisher);
    ParticipantLeftDomainEvent event =
        new ParticipantLeftDomainEvent(
            10L, 8L, 101L, 1, 100L, ParticipantLeaveReason.LEFT, null);

    listener.handle(event);

    verify(publisher)
        .publishRoomEvent(
            10L,
            8L,
            RealtimeEventType.PARTICIPANT_LEFT,
            new ParticipantLeftData(101L, 1, 100L, ParticipantLeaveReason.LEFT));
    verifyNoMoreInteractions(publisher);
  }
}
