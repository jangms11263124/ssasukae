package com.ssafy.ssasukae.domain.room.dto;

import com.ssafy.ssasukae.domain.room.type.RoomMode;

public record CreateRoomResponse(
    Long roomId, String inviteCode, RoomMode mode, String mediaConnectionToken) {}
