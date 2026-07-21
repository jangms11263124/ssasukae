package com.ssafy.ssasukae.domain.card.event;

import com.ssafy.ssasukae.domain.card.entity.CardAssignment;
import com.ssafy.ssasukae.domain.card.type.CardAssignmentStatus;
import com.ssafy.ssasukae.domain.card.type.CardEffectType;

public record AssignedCardDetails(
    Long userId,
    Long participantId,
    Long assignmentId,
    Long cardDefinitionId,
    String code,
    String name,
    String description,
    int durationSeconds,
    CardEffectType effectType,
    Integer effectValue,
    CardAssignmentStatus status) {

  public static AssignedCardDetails from(CardAssignment assignment) {
    return new AssignedCardDetails(
        assignment.getOwner().getUser().getId(),
        assignment.getOwner().getId(),
        assignment.getId(),
        assignment.getCardDefinition().getId(),
        assignment.getCardDefinition().getCode(),
        assignment.getCardDefinition().getName(),
        assignment.getCardDefinition().getDescription(),
        assignment.getCardDefinition().getDurationSeconds(),
        assignment.getCardDefinition().getEffectType(),
        assignment.getCardDefinition().getEffectValue(),
        assignment.getStatus());
  }
}
