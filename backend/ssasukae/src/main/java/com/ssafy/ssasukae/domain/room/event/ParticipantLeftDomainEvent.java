package com.ssafy.ssasukae.domain.room.event;

import com.ssafy.ssasukae.domain.room.type.ParticipantLeaveReason;

public record ParticipantLeftDomainEvent(
        Long roomId,
        long participantLeftVersion,
        Long participantId,
        int participantCount,
        Long hostParticipantId,
        ParticipantLeaveReason reason,
        Long hostChangedVersion
) {

    public boolean hasHostChanged() {
        return hostChangedVersion != null;
    }
}