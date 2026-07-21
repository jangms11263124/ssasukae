package com.ssafy.ssasukae.domain.room.event;

public record ParticipantJoinedDomainEvent(
    Long roomId,
    long version,
    Long participantId,
    String nickname,
    int participantCount) {}
