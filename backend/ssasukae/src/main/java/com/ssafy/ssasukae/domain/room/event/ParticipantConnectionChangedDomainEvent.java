package com.ssafy.ssasukae.domain.room.event;

import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;

public record ParticipantConnectionChangedDomainEvent(
    Long roomId,
    long version,
    Long participantId,
    ConnectionStatus connectionStatus,
    Long newHostParticipantId,
    Long hostChangedVersion) {

  public ParticipantConnectionChangedDomainEvent(
      Long roomId,
      long version,
      Long participantId,
      ConnectionStatus connectionStatus) {
    this(roomId, version, participantId, connectionStatus, null, null);
  }
}
