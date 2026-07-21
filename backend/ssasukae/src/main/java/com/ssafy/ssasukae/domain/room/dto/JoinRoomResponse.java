package com.ssafy.ssasukae.domain.room.dto;

import com.ssafy.ssasukae.domain.room.type.RoomMode;

public record JoinRoomResponse(
    Long roomId,
    String name,
    RoomMode mode,
    int participantCount,
    String mediaConnectionToken) {}
