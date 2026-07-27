package com.ssafy.ssasukae.domain.room.websocket.payload;

import com.ssafy.ssasukae.domain.room.websocket.type.ParticipantStatus;

// 참가자 상태 변경 페이로드
public record ParticipantConnectionStatusChangedPayload(
        Long participantId,
        ParticipantStatus status) {}
