package com.ssafy.ssasukae.domain.room.event;

import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;

public record ParticipantConnectionChangedData(
    Long participantId, ConnectionStatus connectionStatus) {}
