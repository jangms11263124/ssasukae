package com.ssafy.ssasukae.domain.room.dto;

public record RoomJoinResponse(
        Long roomId,
        Long participantId,
        String inviteCode,
        String openViduSessionId,
        String openViduToken
) {
}