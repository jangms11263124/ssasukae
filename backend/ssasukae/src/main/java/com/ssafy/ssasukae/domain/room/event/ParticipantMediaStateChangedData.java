package com.ssafy.ssasukae.domain.room.event;

public record ParticipantMediaStateChangedData(
    Long participantId,
    boolean micEnabled,
    boolean cameraEnabled) {}
