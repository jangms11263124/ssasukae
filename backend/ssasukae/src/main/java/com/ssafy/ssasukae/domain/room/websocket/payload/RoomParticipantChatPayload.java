package com.ssafy.ssasukae.domain.room.websocket.payload;

import java.time.LocalDateTime;

public record RoomParticipantChatPayload(
        Long participantId,
        String message,
        LocalDateTime sendAt
) {}
