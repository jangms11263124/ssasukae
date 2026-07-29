package com.ssafy.ssasukae.domain.room.websocket.payload;

// 참가자 방 떠남 페이로드
public record ParticipantLeftPayload(
        Long participantId) {}
