package com.ssafy.ssasukae.domain.room.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;

public record RoomSnapshotResponse(
    Long roomId,
    String name,
    String inviteCode,
    RoomMode mode,
    RoomStatus status,
    long version,
    Long hostParticipantId,
    List<RoomParticipantResponse> participants,
    @JsonInclude(JsonInclude.Include.ALWAYS) Object activePerformance) {}
