package com.ssafy.ssasukae.domain.room.websocket.payload;

// 방장 변경 페이로드
public record RoomHostChangedPayload(
        Long participantId) {}
