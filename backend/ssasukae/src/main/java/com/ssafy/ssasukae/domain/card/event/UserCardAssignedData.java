package com.ssafy.ssasukae.domain.card.event;

import com.ssafy.ssasukae.domain.card.type.CardAssignmentStatus;
import com.ssafy.ssasukae.domain.card.type.CardEffectType;

public record UserCardAssignedData(
    Long performanceId,
    Long participantId,
    Long assignmentId,
    Long cardDefinitionId,
    String code,
    String name,
    String description,
    int durationSeconds,
    CardEffectType effectType,
    Integer effectValue,
    CardAssignmentStatus status) {}
