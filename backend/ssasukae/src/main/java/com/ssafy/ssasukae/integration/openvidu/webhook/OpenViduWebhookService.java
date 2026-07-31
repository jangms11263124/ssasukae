package com.ssafy.ssasukae.integration.openvidu.webhook;

import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.recovery.ParticipantReconnectDeadlineStore;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketEventType;
import com.ssafy.ssasukae.domain.room.websocket.payload.ParticipantConnectionStatusChangedPayload;
import com.ssafy.ssasukae.domain.room.websocket.payload.ParticipantJoinedPayload;
import com.ssafy.ssasukae.domain.room.websocket.type.ParticipantStatus;
import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryProperties;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.room.RoomErrorCode;
import com.ssafy.ssasukae.global.websocket.message.WebSocketEvent;
import com.ssafy.ssasukae.global.websocket.publisher.WebSocketEventPublisher;
import com.ssafy.ssasukae.integration.openvidu.webhook.dto.OpenViduServerData;
import com.ssafy.ssasukae.integration.openvidu.webhook.dto.OpenViduWebhookRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class OpenViduWebhookService {
    private final ObjectMapper objectMapper;
    private final RoomParticipantRepository roomParticipantRepository;
    private final WebSocketEventPublisher webSocketEventPublisher;
    private final RoomRepository roomRepository;
    private final ParticipantReconnectDeadlineStore deadlineStore;
    private final PerformanceRecoveryProperties recoveryProperties;

    @Transactional
    public void handleParticipantJoined(OpenViduWebhookRequest request) {
        validateRequest(request);
        String connectionId = request.connectionId();
        RoomParticipant participant = getParticipant(request);

        if(participant.isOnline() && Objects.equals(participant.getConnectionId(), connectionId)) {
            deadlineStore.delete(participant.getId());
            return;
        }

        ConnectionStatus previousState = participant.getConnectionStatus();
        if(previousState == ConnectionStatus.PREPARING) participant.connect(connectionId);
        else if (previousState == ConnectionStatus.DISCONNECTED
                || previousState == ConnectionStatus.CONNECTED) participant.reconnect(connectionId);
        else throw new CustomException(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED);

        deadlineStore.delete(participant.getId());

        if(previousState == ConnectionStatus.PREPARING) {
            webSocketEventPublisher.publishToRoom(participant.getRoom().getId(), WebSocketEvent.roomEvent(RoomWebSocketEventType.PARTICIPANT_JOINED, participant.getRoom().getId(), new ParticipantJoinedPayload(participant.getId(), participant.getUser().getNickname())));
            return;
        }

        webSocketEventPublisher.publishToRoom(participant.getRoom().getId(), WebSocketEvent.roomEvent(RoomWebSocketEventType.PARTICIPANT_CONNECTION_STATUS_CHANGED, participant.getRoom().getId(), new ParticipantConnectionStatusChangedPayload(participant.getId(), ParticipantStatus.ONLINE)));
    }

    @Transactional
    public void handleParticipantLeft(OpenViduWebhookRequest request) {
        validateRequest(request);
        String connectionId = request.connectionId();
        RoomParticipant participant = getParticipant(request);

        if(!Objects.equals(participant.getConnectionId(), connectionId)) return;
        if(participant.getConnectionStatus() != ConnectionStatus.CONNECTED) return;

        participant.disconnect(LocalDateTime.now());
        deadlineStore.save(
                participant.getId(),
                Instant.now().plus(recoveryProperties.getPerformerDisconnectGrace())
        );

        webSocketEventPublisher.publishToRoom(participant.getRoom().getId(), WebSocketEvent.roomEvent(RoomWebSocketEventType.PARTICIPANT_CONNECTION_STATUS_CHANGED, participant.getRoom().getId(), new ParticipantConnectionStatusChangedPayload(participant.getId(), ParticipantStatus.DISCONNECTED)));
    }

    @Transactional
    public void handleSessionDestroyed(OpenViduWebhookRequest request) {
        Room room = roomRepository.findByOpenViduSessionId(request.sessionId()).orElse(null);
        if (room == null) return;
        if (room.getStatus() == RoomStatus.TERMINATED) return;

        room.terminate(LocalDateTime.now());
    }

    private void validateRequest(OpenViduWebhookRequest request) {
        if(request == null
        || !StringUtils.hasText(request.sessionId())
        || !StringUtils.hasText(request.connectionId())
        || !StringUtils.hasText(request.serverData())) throw new CustomException(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED);
    }

    private RoomParticipant getParticipant(OpenViduWebhookRequest request) {
        OpenViduServerData serverData = objectMapper.readValue(
                request.serverData(),
                OpenViduServerData.class
        );
        if(serverData.participantId() == null || serverData.participantId() <= 0) throw new CustomException(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED);
        RoomParticipant participant = roomParticipantRepository.findByIdForUpdate(serverData.participantId()).orElseThrow(() -> new CustomException(RoomErrorCode.PARTICIPANT_NOT_FOUND));
        if(!participant.getRoom().getOpenViduSessionId().equals(request.sessionId())) throw new CustomException(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED);

        return participant;
    }
}
