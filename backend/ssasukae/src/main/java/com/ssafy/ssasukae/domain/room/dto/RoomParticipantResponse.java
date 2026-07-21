package com.ssafy.ssasukae.domain.room.dto;

import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.ParticipantRole;

public record RoomParticipantResponse(
    Long participantId,
    String nickname,
    ParticipantRole role,
    ConnectionStatus connectionStatus,
    boolean ready,
    boolean micEnabled,
    boolean cameraEnabled) {

  public static RoomParticipantResponse from(RoomParticipant participant) {
    return new RoomParticipantResponse(
        participant.getId(),
        participant.getUser().getNickname(),
        participant.getRole(),
        participant.getConnectionStatus(),
        participant.isReady(),
        participant.isMicEnabled(),
        participant.isCameraEnabled());
  }
}
