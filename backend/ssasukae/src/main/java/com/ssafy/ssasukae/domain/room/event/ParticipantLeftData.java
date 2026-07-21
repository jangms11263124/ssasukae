package com.ssafy.ssasukae.domain.room.event;

import com.ssafy.ssasukae.domain.room.type.ParticipantLeaveReason;

public record ParticipantLeftData(
        Long participantId,
        int participantCount,
        Long hostParticipantId,
        ParticipantLeaveReason reason
) {
}