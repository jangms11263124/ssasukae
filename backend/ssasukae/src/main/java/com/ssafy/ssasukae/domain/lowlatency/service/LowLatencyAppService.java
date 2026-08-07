package com.ssafy.ssasukae.domain.lowlatency.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import com.ssafy.ssasukae.domain.auth.dto.TokenReissueResponse;
import com.ssafy.ssasukae.domain.auth.service.AuthService;
import com.ssafy.ssasukae.domain.lowlatency.config.LowLatencyProperties;
import com.ssafy.ssasukae.domain.lowlatency.dto.LowLatencyAppSessionResponse;
import com.ssafy.ssasukae.domain.lowlatency.dto.LowLatencyTokenRefreshResponse;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketEventType;
import com.ssafy.ssasukae.domain.room.websocket.payload.ParticipantConnectionStatusChangedPayload;
import com.ssafy.ssasukae.domain.room.websocket.payload.ParticipantJoinedPayload;
import com.ssafy.ssasukae.domain.room.websocket.type.ParticipantStatus;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.lowlatency.LowLatencyErrorCode;
import com.ssafy.ssasukae.global.exception.room.RoomErrorCode;
import com.ssafy.ssasukae.global.security.jwt.JwtProperties;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;
import com.ssafy.ssasukae.global.websocket.message.WebSocketEvent;
import com.ssafy.ssasukae.global.websocket.publisher.WebSocketEventPublisher;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class LowLatencyAppService {

  private final RoomRepository roomRepository;
  private final RoomParticipantRepository roomParticipantRepository;
  private final JwtTokenProvider jwtTokenProvider;
  private final JwtProperties jwtProperties;
  private final AuthService authService;
  private final LowLatencyProperties lowLatencyProperties;
  private final WebSocketEventPublisher webSocketEventPublisher;

  @Transactional
  public LowLatencyAppSessionResponse createAppSession(
      Long authenticatedUserId, Long roomId, String currentAccessToken) {
    Room room = getLowLatencyRoom(roomId);
    RoomParticipant participant = getActiveParticipant(roomId, authenticatedUserId);

    Long tokenUserId = jwtTokenProvider.getUserId(currentAccessToken);
    if (!authenticatedUserId.equals(tokenUserId)) {
      throw new CustomException(LowLatencyErrorCode.ROOM_ACCESS_DENIED);
    }

    // The native audio app is the presence connection for LOW_LATENCY rooms.
    // There is intentionally no OpenVidu media connection in this mode, so the OpenVidu
    // webhook never fires for these participants. This is the only place that can tell the
    // rest of the room that they came online.
    if (!participant.isOnline()) {
      ConnectionStatus previousStatus = participant.getConnectionStatus();
      participant.reconnect(null);
      publishPresence(room.getId(), participant, previousStatus);
    }

    String sid = jwtTokenProvider.getSid(currentAccessToken);
    String appAccessToken =
        jwtTokenProvider.createAccessToken(
            participant.getUser().getId(),
            participant.getUser().getEmail(),
            participant.getUser().getRole().name(),
            sid);
    String appRefreshToken =
        jwtTokenProvider.createRefreshToken(participant.getUser().getId(), sid);

    return new LowLatencyAppSessionResponse(
        room.getId(),
        participant.getId(),
        room.getId(),
        room.getName(),
        participant.getUser().getNickname(),
        room.getInviteCode(),
        lowLatencyProperties.getRendezvousServer(),
        appAccessToken,
        appRefreshToken,
        accessTokenExpiresInSeconds());
  }

  public LowLatencyTokenRefreshResponse refresh(String appRefreshToken) {
    TokenReissueResponse tokens = authService.reissueToken(appRefreshToken);
    return new LowLatencyTokenRefreshResponse(
        tokens.getAccessToken(), tokens.getRefreshToken(), accessTokenExpiresInSeconds());
  }

  private Room getLowLatencyRoom(Long roomId) {
    Room room =
        roomRepository
            .findById(roomId)
            .orElseThrow(() -> new CustomException(RoomErrorCode.ROOM_NOT_FOUND));

    if (room.getStatus() == RoomStatus.TERMINATED) {
      throw new CustomException(RoomErrorCode.ROOM_CLOSED);
    }
    if (room.getMode() != RoomMode.LOW_LATENCY) {
      throw new CustomException(LowLatencyErrorCode.LOW_LATENCY_MODE_REQUIRED);
    }
    if (!StringUtils.hasText(lowLatencyProperties.getRendezvousServer())) {
      throw new CustomException(LowLatencyErrorCode.RENDEZVOUS_SERVER_NOT_CONFIGURED);
    }
    return room;
  }

  private RoomParticipant getActiveParticipant(Long roomId, Long userId) {
    RoomParticipant participant =
        roomParticipantRepository
            .findByRoomIdAndUserId(roomId, userId)
            .orElseThrow(() -> new CustomException(RoomErrorCode.PARTICIPANT_NOT_FOUND));
    if (!participant.isActive()) {
      throw new CustomException(RoomErrorCode.PARTICIPANT_NOT_ACTIVE);
    }
    return participant;
  }

  private long accessTokenExpiresInSeconds() {
    return Math.max(1L, jwtProperties.getAccessTokenExpiration() / 1_000L);
  }

  /**
   * OpenViduWebhookService#handleParticipantJoined 와 동일한 분기로 프레즌스를 브로드캐스트한다. 첫 입장(PREPARING)이면
   * PARTICIPANT_JOINED, 재접속(DISCONNECTED)이면 상태 변경 이벤트를 보낸다.
   */
  private void publishPresence(
      Long roomId, RoomParticipant participant, ConnectionStatus previousStatus) {
    if (previousStatus == ConnectionStatus.PREPARING) {
      ParticipantJoinedPayload joined =
          new ParticipantJoinedPayload(
              participant.getId(),
              participant.getUser().getId(),
              participant.getUser().getNickname(),
              participant.getUser().getProfileImageUrl());
      afterCommit(
          () ->
              webSocketEventPublisher.publishToRoom(
                  roomId,
                  WebSocketEvent.roomEvent(
                      RoomWebSocketEventType.PARTICIPANT_JOINED, roomId, joined)));
      return;
    }

    ParticipantConnectionStatusChangedPayload online =
        new ParticipantConnectionStatusChangedPayload(
            participant.getId(), ParticipantStatus.ONLINE);
    afterCommit(
        () ->
            webSocketEventPublisher.publishToRoom(
                roomId,
                WebSocketEvent.roomEvent(
                    RoomWebSocketEventType.PARTICIPANT_CONNECTION_STATUS_CHANGED, roomId, online)));
  }

  private void afterCommit(Runnable action) {
    if (!TransactionSynchronizationManager.isSynchronizationActive()) {
      action.run();
      return;
    }

    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCommit() {
            action.run();
          }
        });
  }
}
