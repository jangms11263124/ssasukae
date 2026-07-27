package com.ssafy.ssasukae.domain.room.dto;

public record RoomCreateResponse(
        Long roomId,
        Long participantId,
        String inviteCode,
        String openViduSessionId,
        String openViduToken
) {
}