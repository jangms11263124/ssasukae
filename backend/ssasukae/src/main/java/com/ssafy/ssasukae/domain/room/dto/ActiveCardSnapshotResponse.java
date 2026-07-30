package com.ssafy.ssasukae.domain.room.dto;

import java.time.OffsetDateTime;

import com.ssafy.ssasukae.domain.card.redis.CardAssignmentSnapshot;
import com.ssafy.ssasukae.domain.card.redis.RoomCardSnapshot;
import com.ssafy.ssasukae.domain.card.redis.RoomCardStatus;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;

public record ActiveCardSnapshotResponse(
    Long performanceId,
    RoomCardStatus roomCardStatus,
    Long cardAssignmentId,
    Long sourceParticipantId,
    Long targetParticipantId,
    String cardImageUrl,
    CardEffectType effectType,
    Integer effectValue,
    Long pausedPlaybackPositionMs,
    OffsetDateTime approvedAt,
    OffsetDateTime activateAt,
    OffsetDateTime startedAt,
    OffsetDateTime endsAt) {

  public static ActiveCardSnapshotResponse from(
      RoomCardSnapshot roomCard, CardAssignmentSnapshot assignment) {
    return new ActiveCardSnapshotResponse(
        roomCard.performanceId(),
        roomCard.status(),
        roomCard.cardAssignmentId(),
        roomCard.sourceParticipantId(),
        roomCard.targetParticipantId(),
        assignment.cardImageUrl(),
        assignment.effectType(),
        assignment.effectValue(),
        roomCard.pausedPlaybackPositionMs(),
        roomCard.approvedAt(),
        roomCard.activateAt(),
        roomCard.startedAt(),
        roomCard.endsAt());
  }
}
