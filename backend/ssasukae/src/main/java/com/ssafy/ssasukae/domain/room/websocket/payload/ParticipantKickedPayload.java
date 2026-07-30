package com.ssafy.ssasukae.domain.room.websocket.payload;

// 참가자 강퇴 페이로드
public record ParticipantKickedPayload(
        Long participantId) {}
