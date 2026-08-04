package com.ssafy.ssasukae.domain.room.websocket.payload;

// 사용자 방 참가 페이로드
public record ParticipantJoinedPayload(
    Long participantId,
    Long userId,
    String nickname,
    String profileImageUrl)
{}
