package com.ssafy.ssasukae.domain.room.event;

public record ParticipantKickedDomainEvent(
    Long roomId,
    long version,
    Long participantId,
    Long userId,
    String nickname,
    Long kickedByUserId,
    int participantCount) {}
