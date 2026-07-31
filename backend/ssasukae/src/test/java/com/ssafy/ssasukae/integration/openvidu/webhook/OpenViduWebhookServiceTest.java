package com.ssafy.ssasukae.integration.openvidu.webhook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryProperties;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.recovery.ParticipantReconnectDeadlineStore;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.websocket.publisher.WebSocketEventPublisher;
import com.ssafy.ssasukae.integration.openvidu.webhook.dto.OpenViduWebhookRequest;

import tools.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class OpenViduWebhookServiceTest {

    private static final Long PARTICIPANT_ID = 10L;
    private static final Long ROOM_ID = 20L;
    private static final String SESSION_ID = "session-1";

    @Mock private RoomParticipantRepository roomParticipantRepository;
    @Mock private WebSocketEventPublisher webSocketEventPublisher;
    @Mock private RoomRepository roomRepository;
    @Mock private ParticipantReconnectDeadlineStore deadlineStore;

    private OpenViduWebhookService service;
    private RoomParticipant participant;

    @BeforeEach
    void setUp() {
        PerformanceRecoveryProperties properties = new PerformanceRecoveryProperties();
        properties.setPerformerDisconnectGrace(Duration.ofSeconds(15));
        service = new OpenViduWebhookService(
                new ObjectMapper(),
                roomParticipantRepository,
                webSocketEventPublisher,
                roomRepository,
                deadlineStore,
                properties
        );

        Room room = room();
        participant = RoomParticipant.join(room, user(), LocalDateTime.now());
        ReflectionTestUtils.setField(participant, "id", PARTICIPANT_ID);
        when(roomParticipantRepository.findByIdForUpdate(PARTICIPANT_ID))
                .thenReturn(Optional.of(participant));
    }

    @Test
    @DisplayName("participantLeft 수신 시 참가자를 DISCONNECTED로 변경하고 deadline을 저장한다")
    void handleParticipantLeftDisconnectsParticipantAndSavesDeadline() {
        participant.connect("connection-1");
        Instant before = Instant.now().plusSeconds(14);

        service.handleParticipantLeft(request("participantLeft", "connection-1"));

        assertThat(participant.getConnectionStatus()).isEqualTo(ConnectionStatus.DISCONNECTED);
        assertThat(participant.getDisconnectedAt()).isNotNull();
        verify(deadlineStore).save(
                eq(PARTICIPANT_ID),
                argThat(deadline -> deadline.isAfter(before))
        );
        verify(webSocketEventPublisher).publishToRoom(eq(ROOM_ID), any());
    }

    @Test
    @DisplayName("이전 connectionId의 participantLeft는 현재 연결을 끊지 않는다")
    void handleParticipantLeftIgnoresOldConnection() {
        participant.connect("connection-new");

        service.handleParticipantLeft(request("participantLeft", "connection-old"));

        assertThat(participant.getConnectionStatus()).isEqualTo(ConnectionStatus.CONNECTED);
        assertThat(participant.getConnectionId()).isEqualTo("connection-new");
        verifyNoInteractions(deadlineStore);
        verify(webSocketEventPublisher, never()).publishToRoom(any(), any());
    }

    @Test
    @DisplayName("participantJoined 재수신 시 참가자를 CONNECTED로 복구하고 deadline을 삭제한다")
    void handleParticipantJoinedReconnectsParticipantAndDeletesDeadline() {
        participant.connect("connection-old");
        participant.disconnect(LocalDateTime.now());

        service.handleParticipantJoined(request("participantJoined", "connection-new"));

        assertThat(participant.getConnectionStatus()).isEqualTo(ConnectionStatus.CONNECTED);
        assertThat(participant.getConnectionId()).isEqualTo("connection-new");
        assertThat(participant.getDisconnectedAt()).isNull();
        verify(deadlineStore).delete(PARTICIPANT_ID);
        verify(webSocketEventPublisher).publishToRoom(eq(ROOM_ID), any());
    }

    private OpenViduWebhookRequest request(String event, String connectionId) {
        return new OpenViduWebhookRequest(
                event,
                System.currentTimeMillis(),
                SESSION_ID,
                connectionId,
                null,
                null,
                null,
                null,
                "{\"participantId\":" + PARTICIPANT_ID + "}",
                null,
                null,
                null
        );
    }

    private Room room() {
        Room room = Room.create(
                "ABC123",
                "테스트방",
                RoomMode.GENERAL,
                user(),
                SESSION_ID,
                LocalDateTime.now()
        );
        ReflectionTestUtils.setField(room, "id", ROOM_ID);
        return room;
    }

    private User user() {
        User user = User.builder()
                .email("user@test.com")
                .nickname("사용자")
                .provider(OAuthProvider.GOOGLE)
                .providerId("provider-id")
                .role(Role.USER)
                .build();
        ReflectionTestUtils.setField(user, "id", 1L);
        return user;
    }
}
