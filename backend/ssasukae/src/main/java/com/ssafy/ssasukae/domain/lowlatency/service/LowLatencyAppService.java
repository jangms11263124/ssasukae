package com.ssafy.ssasukae.domain.lowlatency.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.lowlatency.LowLatencyErrorCode;
import com.ssafy.ssasukae.global.exception.room.RoomErrorCode;
import com.ssafy.ssasukae.global.security.jwt.JwtProperties;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;

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
    // There is intentionally no OpenVidu media connection in this mode.
    if (!participant.isOnline()) {
      participant.reconnect(null);
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
}
