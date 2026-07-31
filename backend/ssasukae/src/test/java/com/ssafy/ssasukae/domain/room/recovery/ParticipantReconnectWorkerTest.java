package com.ssafy.ssasukae.domain.room.recovery;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryProperties;
import com.ssafy.ssasukae.domain.room.service.RoomService;

@ExtendWith(MockitoExtension.class)
class ParticipantReconnectWorkerTest {

    @Mock private ParticipantReconnectDeadlineStore deadlineStore;
    @Mock private RoomService roomService;

    private ParticipantReconnectWorker worker;

    @BeforeEach
    void setUp() {
        PerformanceRecoveryProperties properties = new PerformanceRecoveryProperties();
        properties.setBatchSize(100);
        worker = new ParticipantReconnectWorker(deadlineStore, properties, roomService);
    }

    @Test
    @DisplayName("재접속 마감 시간이 지난 참가자를 실제 퇴장시키고 deadline을 삭제한다")
    void expireDisconnectedParticipantsLeavesParticipantAndDeletesDeadline() {
        when(deadlineStore.findDueParticipantIds(any(), eq(100)))
                .thenReturn(List.of(10L, 11L));

        worker.expireDisconnectedParticipants();

        verify(roomService).leaveByConnectionExpiration(10L);
        verify(roomService).leaveByConnectionExpiration(11L);
        verify(deadlineStore).delete(10L);
        verify(deadlineStore).delete(11L);
    }

    @Test
    @DisplayName("참가자 퇴장 처리에 실패하면 deadline을 삭제하지 않는다")
    void expireDisconnectedParticipantsKeepsDeadlineWhenLeaveFails() {
        when(deadlineStore.findDueParticipantIds(any(), eq(100)))
                .thenReturn(List.of(10L));
        doThrow(new IllegalStateException("퇴장 처리 실패"))
                .when(roomService)
                .leaveByConnectionExpiration(10L);

        worker.expireDisconnectedParticipants();

        verify(deadlineStore, never()).delete(10L);
    }
}
