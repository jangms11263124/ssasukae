package com.ssafy.ssasukae.domain.room.dto;

import java.time.OffsetDateTime;

import com.ssafy.ssasukae.domain.card.redis.CardAssignmentSnapshot;
import com.ssafy.ssasukae.domain.card.redis.CardAssignmentStatus;

public record CardUsageStatusResponse(
    Long performanceId, Long participantId, CardAssignmentStatus status, OffsetDateTime usedAt) {

  public static CardUsageStatusResponse from(CardAssignmentSnapshot assignment) {
    return new CardUsageStatusResponse(
        assignment.performanceId(),
        assignment.participantId(),
        assignment.status(),
        assignment.usedAt());
  }
}
