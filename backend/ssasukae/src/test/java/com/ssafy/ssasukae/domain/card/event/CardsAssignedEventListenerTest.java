package com.ssafy.ssasukae.domain.card.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import com.ssafy.ssasukae.domain.card.type.CardAssignmentStatus;
import com.ssafy.ssasukae.domain.card.type.CardEffectType;
import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;

import org.junit.jupiter.api.Test;

class CardsAssignedEventListenerTest {

  @Test
  void sendsCardDetailsPrivatelyAndOnlyCompletionCountToRoom() {
    CapturingPublisher publisher = new CapturingPublisher();
    CardsAssignedEventListener listener = new CardsAssignedEventListener(publisher);
    CardsAssignedDomainEvent event =
        new CardsAssignedDomainEvent(
            1L,
            7L,
            10L,
            List.of(
                new AssignedCardDetails(
                    20L,
                    200L,
                    300L,
                    400L,
                    "PITCH_UP_6",
                    "음정 상승",
                    "음정을 6만큼 올립니다.",
                    10,
                    CardEffectType.PITCH_SHIFT,
                    6,
                    CardAssignmentStatus.ASSIGNED)));

    listener.handle(event);

    assertThat(publisher.userEvents).hasSize(1);
    UserEvent privateEvent = publisher.userEvents.get(0);
    assertThat(privateEvent.userId()).isEqualTo(20L);
    assertThat(privateEvent.destination()).isEqualTo("/queue/cards");
    assertThat(privateEvent.type()).isEqualTo(RealtimeEventType.USER_CARD_ASSIGNED);
    assertThat(privateEvent.data())
        .isEqualTo(
            new UserCardAssignedData(
                10L,
                200L,
                300L,
                400L,
                "PITCH_UP_6",
                "음정 상승",
                "음정을 6만큼 올립니다.",
                10,
                CardEffectType.PITCH_SHIFT,
                6,
                CardAssignmentStatus.ASSIGNED));

    assertThat(publisher.roomType).isEqualTo(RealtimeEventType.CARD_ASSIGNMENT_COMPLETED);
    assertThat(publisher.roomData).isEqualTo(new CardAssignmentCompletedData(10L, 1));
  }

  private static class CapturingPublisher extends RoomRealtimeEventPublisher {
    private final List<UserEvent> userEvents = new ArrayList<>();
    private RealtimeEventType roomType;
    private Object roomData;

    CapturingPublisher() {
      super(null, null);
    }

    @Override
    public <T> void publishUserEvent(
        Long userId,
        String destination,
        Long roomId,
        long version,
        RealtimeEventType type,
        T data) {
      userEvents.add(new UserEvent(userId, destination, roomId, version, type, data));
    }

    @Override
    public <T> void publishRoomEvent(
        Long roomId, long version, RealtimeEventType type, T data) {
      roomType = type;
      roomData = data;
    }
  }

  private record UserEvent(
      Long userId,
      String destination,
      Long roomId,
      long version,
      RealtimeEventType type,
      Object data) {}
}
