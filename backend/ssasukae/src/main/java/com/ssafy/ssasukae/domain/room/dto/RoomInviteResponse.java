package com.ssafy.ssasukae.domain.room.dto;

import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;

public record RoomInviteResponse(
        Long roomId,
        String inviteCode,
        String name,
        RoomMode mode,
        RoomStatus status,
        long currentParticipants,
        int maxParticipants,
        boolean joinable
) {}
