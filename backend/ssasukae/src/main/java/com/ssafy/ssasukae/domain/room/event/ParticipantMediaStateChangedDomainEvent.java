package com.ssafy.ssasukae.domain.room.event;

public record ParticipantMediaStateChangedDomainEvent(
    Long roomId,
    long version,
    Long participantId,
    boolean micEnabled,
    boolean cameraEnabled) {}
