package com.ssafy.ssasukae.domain.room.dto;

public record RoomTokenResponse(
        Long roomId,
        String openviduToken
) {
}
