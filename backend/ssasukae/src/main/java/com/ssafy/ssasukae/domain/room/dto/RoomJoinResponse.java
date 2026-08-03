package com.ssafy.ssasukae.domain.room.dto;

import com.ssafy.ssasukae.domain.room.type.RoomMode;

public record RoomJoinResponse(
        Long roomId,
        Long participantId,
        String inviteCode,
        String openViduSessionId,
        String openViduToken,
        RoomMode mode
) {
}