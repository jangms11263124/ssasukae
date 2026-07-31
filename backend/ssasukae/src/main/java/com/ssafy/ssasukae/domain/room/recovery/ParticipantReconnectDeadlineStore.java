package com.ssafy.ssasukae.domain.room.recovery;

import java.time.Instant;
import java.util.List;

public interface ParticipantReconnectDeadlineStore {

    void save(Long participantId, Instant deadline);

    void delete(Long participantId);

    List<Long> findDueParticipantIds(Instant now, int limit);
}
