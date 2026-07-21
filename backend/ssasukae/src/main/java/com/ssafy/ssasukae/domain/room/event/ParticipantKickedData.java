package com.ssafy.ssasukae.domain.room.event;

public record ParticipantKickedData(
    Long participantId,
    Long userId,
    String nickname,
    Long kickedByUserId,
    int participantCount) {}
