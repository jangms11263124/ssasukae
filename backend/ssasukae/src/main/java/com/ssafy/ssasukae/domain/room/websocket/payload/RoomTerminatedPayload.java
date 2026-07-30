package com.ssafy.ssasukae.domain.room.websocket.payload;

import java.time.LocalDateTime;

public record RoomTerminatedPayload(
        LocalDateTime terminatedAt
) {}
