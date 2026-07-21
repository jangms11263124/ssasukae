package com.ssafy.ssasukae.domain.room.event;

public record ParticipantJoinedData(
    Long participantId, String nickname, int participantCount) {}
