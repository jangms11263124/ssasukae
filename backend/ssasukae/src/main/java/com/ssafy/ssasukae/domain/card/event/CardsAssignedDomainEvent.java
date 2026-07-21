package com.ssafy.ssasukae.domain.card.event;

import java.util.List;

public record CardsAssignedDomainEvent(
    Long roomId,
    long roomVersion,
    Long performanceId,
    List<AssignedCardDetails> assignments) {

  public CardsAssignedDomainEvent {
    assignments = List.copyOf(assignments);
  }
}
