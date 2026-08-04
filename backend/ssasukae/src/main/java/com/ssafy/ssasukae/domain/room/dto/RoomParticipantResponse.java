package com.ssafy.ssasukae.domain.room.dto;

import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.ParticipantRole;

public record RoomParticipantResponse(
    Long participantId,
    Long userId,
    String nickname,
    String profileImageUrl,
    ParticipantRole stageRole,
    ConnectionStatus connectionStatus,
    boolean host) {

  public static RoomParticipantResponse from(RoomParticipant participant) {
    Long userId = participant.getUser().getId();

    return new RoomParticipantResponse(
        participant.getId(),
        userId,
        participant.getUser().getNickname(),
        participant.getUser().getProfileImageUrl(),
        participant.getStageRole(),
        participant.getConnectionStatus(),
        participant.getRoom().isHost(userId));
  }
}
