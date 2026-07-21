package com.ssafy.ssasukae.domain.card.event;

import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class CardsAssignedEventListener {

  private static final String PRIVATE_CARD_DESTINATION = "/queue/cards";

  private final RoomRealtimeEventPublisher realtimeEventPublisher;

  public CardsAssignedEventListener(RoomRealtimeEventPublisher realtimeEventPublisher) {
    this.realtimeEventPublisher = realtimeEventPublisher;
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void handle(CardsAssignedDomainEvent event) {
    event.assignments()
        .forEach(
            assignment ->
                realtimeEventPublisher.publishUserEvent(
                    assignment.userId(),
                    PRIVATE_CARD_DESTINATION,
                    event.roomId(),
                    event.roomVersion(),
                    RealtimeEventType.USER_CARD_ASSIGNED,
                    new UserCardAssignedData(
                        event.performanceId(),
                        assignment.participantId(),
                        assignment.assignmentId(),
                        assignment.cardDefinitionId(),
                        assignment.code(),
                        assignment.name(),
                        assignment.description(),
                        assignment.durationSeconds(),
                        assignment.effectType(),
                        assignment.effectValue(),
                        assignment.status())));

    realtimeEventPublisher.publishRoomEvent(
        event.roomId(),
        event.roomVersion(),
        RealtimeEventType.CARD_ASSIGNMENT_COMPLETED,
        new CardAssignmentCompletedData(event.performanceId(), event.assignments().size()));
  }
}
