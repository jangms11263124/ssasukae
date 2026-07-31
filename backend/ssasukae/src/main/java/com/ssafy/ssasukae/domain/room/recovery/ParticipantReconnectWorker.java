package com.ssafy.ssasukae.domain.room.recovery;

import java.time.Instant;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryProperties;
import com.ssafy.ssasukae.domain.room.service.RoomService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
@RequiredArgsConstructor
public class ParticipantReconnectWorker {

    private final ParticipantReconnectDeadlineStore deadlineStore;
    private final PerformanceRecoveryProperties properties;
    private final RoomService roomService;

    @Scheduled(fixedDelayString = "${performance.recovery.scan-delay:1s}")
    public void expireDisconnectedParticipants() {
        Instant now = Instant.now();

        for (Long participantId : deadlineStore.findDueParticipantIds(
                now,
                properties.getBatchSize()
        )) {
            try {
                roomService.leaveByConnectionExpiration(participantId);
                deadlineStore.delete(participantId);
            } catch (RuntimeException exception) {
                log.error(
                        "참가자 연결 만료 처리에 실패했습니다. participantId={}",
                        participantId,
                        exception
                );
            }
        }
    }
}
