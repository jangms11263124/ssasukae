package com.ssafy.ssasukae.domain.lowlatency.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.lowlatency.LowLatencyErrorCode;
import com.ssafy.ssasukae.global.security.jwt.JwtProperties;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;
import com.ssafy.ssasukae.global.websocket.message.WebSocketEvent;
import com.ssafy.ssasukae.global.websocket.publisher.WebSocketEventPublisher;

@ExtendWith(MockitoExtension.class)
class LowLatencyAppServiceTest {

  @Mock private RoomRepository roomRepository;
  @Mock private RoomParticipantRepository roomParticipantRepository;
  @Mock private JwtTokenProvider jwtTokenProvider;
  @Mock private AuthService authService;
  @Mock private WebSocketEventPublisher webSocketEventPublisher;
  @Mock private Room room;
  @Mock private RoomParticipant participant;
  @Mock private User user;

  private JwtProperties jwtProperties;
  private LowLatencyProperties lowLatencyProperties;
  private LowLatencyAppService lowLatencyAppService;

  @BeforeEach
  void setUp() {
    jwtProperties = new JwtProperties();
    jwtProperties.setAccessTokenExpiration(600_000L);

    lowLatencyProperties = new LowLatencyProperties();
    lowLatencyProperties.setRendezvousServer("15.165.205.31:50000");

    lowLatencyAppService =
        new LowLatencyAppService(
            roomRepository,
            roomParticipantRepository,
            jwtTokenProvider,
            jwtProperties,
            authService,
            lowLatencyProperties,
            webSocketEventPublisher);
  }

  @Test
  void createAppSessionReturnsRustLaunchContractAndKeepsWebSid() {
    when(roomRepository.findById(12L)).thenReturn(Optional.of(room));
    when(room.getStatus()).thenReturn(RoomStatus.PREPARING);
    when(room.getMode()).thenReturn(RoomMode.LOW_LATENCY);
    when(room.getId()).thenReturn(12L);
    when(room.getName()).thenReturn("저지연 방");
    when(room.getInviteCode()).thenReturn("ABC123");
    when(roomParticipantRepository.findByRoomIdAndUserId(12L, 1L))
        .thenReturn(Optional.of(participant));
    when(participant.isActive()).thenReturn(true);
    when(participant.getId()).thenReturn(3L);
    when(participant.getConnectionStatus()).thenReturn(ConnectionStatus.PREPARING);
    when(participant.getUser()).thenReturn(user);
    when(user.getId()).thenReturn(1L);
    when(user.getEmail()).thenReturn("user@test.com");
    when(user.getRole()).thenReturn(Role.USER);
    when(user.getNickname()).thenReturn("테스터");
    when(user.getProfileImageUrl()).thenReturn("https://cdn.test/profile.png");
    when(jwtTokenProvider.getUserId("web-access")).thenReturn(1L);
    when(jwtTokenProvider.getSid("web-access")).thenReturn("web-sid");
    when(jwtTokenProvider.createAccessToken(1L, "user@test.com", "USER", "web-sid"))
        .thenReturn("app-access");
    when(jwtTokenProvider.createRefreshToken(1L, "web-sid")).thenReturn("app-refresh");

    LowLatencyAppSessionResponse response =
        lowLatencyAppService.createAppSession(1L, 12L, "web-access");

    assertThat(response.roomId()).isEqualTo(12L);
    assertThat(response.participantId()).isEqualTo(3L);
    assertThat(response.sessionId()).isEqualTo(12L);
    assertThat(response.roomName()).isEqualTo("저지연 방");
    assertThat(response.nickname()).isEqualTo("테스터");
    assertThat(response.inviteCode()).isEqualTo("ABC123");
    assertThat(response.rendezvousServer()).isEqualTo("15.165.205.31:50000");
    assertThat(response.accessToken()).isEqualTo("app-access");
    assertThat(response.appRefreshToken()).isEqualTo("app-refresh");
    assertThat(response.accessTokenExpiresInSeconds()).isEqualTo(600L);
    verify(participant).reconnect(null);
    verify(jwtTokenProvider).createAccessToken(1L, "user@test.com", "USER", "web-sid");
  }

  @Test
  void createAppSessionBroadcastsParticipantJoinedOnFirstAppEntry() {
    stubLowLatencyRoom();
    stubActiveParticipant(ConnectionStatus.PREPARING);
    when(user.getProfileImageUrl()).thenReturn("https://cdn.test/profile.png");

    lowLatencyAppService.createAppSession(1L, 12L, "web-access");

    WebSocketEvent<?> event = capturePublishedEvent();
    assertThat(event.eventType()).isEqualTo(RoomWebSocketEventType.PARTICIPANT_JOINED.name());
    assertThat(event.payload())
        .isEqualTo(new ParticipantJoinedPayload(3L, 1L, "테스터", "https://cdn.test/profile.png"));
  }

  @Test
  void createAppSessionBroadcastsOnlineWhenReconnectingFromDisconnected() {
    stubLowLatencyRoom();
    stubActiveParticipant(ConnectionStatus.DISCONNECTED);

    lowLatencyAppService.createAppSession(1L, 12L, "web-access");

    WebSocketEvent<?> event = capturePublishedEvent();
    assertThat(event.eventType())
        .isEqualTo(RoomWebSocketEventType.PARTICIPANT_CONNECTION_STATUS_CHANGED.name());
    assertThat(event.payload())
        .isEqualTo(new ParticipantConnectionStatusChangedPayload(3L, ParticipantStatus.ONLINE));
  }

  @Test
  void createAppSessionDoesNotRebroadcastWhenAlreadyOnline() {
    stubLowLatencyRoom();
    stubActiveParticipant(ConnectionStatus.CONNECTED);
    when(participant.isOnline()).thenReturn(true);

    lowLatencyAppService.createAppSession(1L, 12L, "web-access");

    verify(participant, never()).reconnect(any());
    verify(webSocketEventPublisher, never()).publishToRoom(any(), any());
  }

  private void stubLowLatencyRoom() {
    when(roomRepository.findById(12L)).thenReturn(Optional.of(room));
    when(room.getStatus()).thenReturn(RoomStatus.PREPARING);
    when(room.getMode()).thenReturn(RoomMode.LOW_LATENCY);
    when(room.getId()).thenReturn(12L);
  }

  /** 참가자 조회부터 토큰 발급까지, 프레즌스 검증에 필요한 최소 스텁만 세운다. */
  private void stubActiveParticipant(ConnectionStatus connectionStatus) {
    when(roomParticipantRepository.findByRoomIdAndUserId(12L, 1L))
        .thenReturn(Optional.of(participant));
    when(participant.isActive()).thenReturn(true);
    when(participant.getId()).thenReturn(3L);
    when(participant.getUser()).thenReturn(user);
    when(user.getId()).thenReturn(1L);
    when(user.getEmail()).thenReturn("user@test.com");
    when(user.getRole()).thenReturn(Role.USER);
    when(user.getNickname()).thenReturn("테스터");
    when(jwtTokenProvider.getUserId("web-access")).thenReturn(1L);
    when(jwtTokenProvider.getSid("web-access")).thenReturn("web-sid");

    if (connectionStatus != ConnectionStatus.CONNECTED) {
      when(participant.getConnectionStatus()).thenReturn(connectionStatus);
    }
  }

  private WebSocketEvent<?> capturePublishedEvent() {
    ArgumentCaptor<WebSocketEvent<?>> captor = ArgumentCaptor.captor();
    verify(webSocketEventPublisher).publishToRoom(eq(12L), captor.capture());
    return captor.getValue();
  }

  @Test
  void createAppSessionRejectsNonLowLatencyRoom() {
    when(roomRepository.findById(12L)).thenReturn(Optional.of(room));
    when(room.getStatus()).thenReturn(RoomStatus.PREPARING);
    when(room.getMode()).thenReturn(RoomMode.GENERAL);

    assertThatThrownBy(() -> lowLatencyAppService.createAppSession(1L, 12L, "web-access"))
        .isInstanceOf(CustomException.class)
        .extracting(error -> ((CustomException) error).getErrorCode())
        .isEqualTo(LowLatencyErrorCode.LOW_LATENCY_MODE_REQUIRED);

    verify(roomParticipantRepository, never()).findByRoomIdAndUserId(12L, 1L);
  }

  @Test
  void refreshReturnsRotatedTokensInRustContract() {
    when(authService.reissueToken("old-app-refresh"))
        .thenReturn(
            TokenReissueResponse.builder()
                .accessToken("new-app-access")
                .refreshToken("new-app-refresh")
                .build());

    LowLatencyTokenRefreshResponse response = lowLatencyAppService.refresh("old-app-refresh");

    assertThat(response.accessToken()).isEqualTo("new-app-access");
    assertThat(response.appRefreshToken()).isEqualTo("new-app-refresh");
    assertThat(response.accessTokenExpiresInSeconds()).isEqualTo(600L);
  }
}
