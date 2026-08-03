package com.ssafy.ssasukae.domain.room.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import com.ssafy.ssasukae.domain.card.service.CardService;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.service.PerformanceRecoveryService;
import com.ssafy.ssasukae.domain.performance.type.PerformanceCancelReason;
import com.ssafy.ssasukae.domain.room.dto.RoomCreateRequest;
import com.ssafy.ssasukae.domain.room.dto.RoomCreateResponse;
import com.ssafy.ssasukae.domain.room.dto.RoomJoinResponse;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.websocket.publisher.WebSocketEventPublisher;
import com.ssafy.ssasukae.integration.openvidu.MediaSessionGateway;
import com.ssafy.ssasukae.integration.aws.S3StorageService;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class RoomServiceMediaSessionTest {

  @Mock private RoomRepository roomRepository;
  @Mock private RoomParticipantRepository roomParticipantRepository;
  @Mock private UserRepository userRepository;
  @Mock private MediaSessionGateway mediaSessionGateway;
  @Mock private PerformanceRecoveryService performanceRecoveryService;
  @Mock private WebSocketEventPublisher webSocketEventPublisher;
  @Mock private CardService cardService;
  @Mock private PerformanceStore performanceStore;
  @Mock private SongRepository songRepository;
  @Mock private S3StorageService s3StorageService;

  private RoomService roomService;
  private final Clock clock =
      Clock.fixed(Instant.parse("2026-07-30T00:00:00Z"), ZoneOffset.UTC);

  @BeforeEach
  void setUp() {
    roomService =
        new RoomService(
            roomRepository,
            roomParticipantRepository,
            userRepository,
            mediaSessionGateway,
            performanceRecoveryService,
            webSocketEventPublisher,
            cardService,
            performanceStore,
            clock,
            songRepository,
            s3StorageService);
  }

  @Test
  @DisplayName("방을 생성하면 OpenVidu 세션을 새로 만들고, 발급된 세션 ID로 호스트의 연결 토큰을 발급한다")
  void createRoom_createsOpenViduSessionAndIssuesConnectionTokenForHost() {
    // given
    User host = user(1L);
    when(userRepository.findById(1L)).thenReturn(Optional.of(host));
    when(roomRepository.existsByInviteCode(any())).thenReturn(false);
    when(mediaSessionGateway.createSession()).thenReturn("openvidu-session-1");
    when(roomRepository.save(any(Room.class)))
        .thenAnswer(
            invocation -> {
              Room room = invocation.getArgument(0);
              ReflectionTestUtils.setField(room, "id", 10L);
              return room;
            });
    when(roomParticipantRepository.save(any(RoomParticipant.class)))
        .thenAnswer(
            invocation -> {
              RoomParticipant participant = invocation.getArgument(0);
              ReflectionTestUtils.setField(participant, "id", 100L);
              return participant;
            });
    when(mediaSessionGateway.createConnectionToken("openvidu-session-1", 100L))
        .thenReturn("openvidu-token-1");

    // when
    RoomCreateResponse response =
        roomService.createRoom(1L, new RoomCreateRequest("노래방", RoomMode.GENERAL));

    // then
    assertThat(response.openViduSessionId()).isEqualTo("openvidu-session-1");
    assertThat(response.openViduToken()).isEqualTo("openvidu-token-1");
    verify(mediaSessionGateway).createSession();
    verify(mediaSessionGateway).createConnectionToken("openvidu-session-1", 100L);
  }

  @Test
  @DisplayName("초대 코드로 입장하면 새 OpenVidu 세션을 만들지 않고, 기존 방 세션 ID로 참가자의 연결 토큰을 발급한다")
  void joinRoom_issuesConnectionTokenUsingExistingRoomSession() {
    // given
    User joiningUser = user(2L);
    Room room = room(10L, "openvidu-session-1");
    when(userRepository.findById(2L)).thenReturn(Optional.of(joiningUser));
    when(roomRepository.findByInviteCodeForUpdate("ABC123"))
        .thenReturn(Optional.of(room));
    when(roomParticipantRepository.existsByRoomIdAndUserIdAndConnectionStatusIn(eq(10L), eq(2L), any()))
        .thenReturn(false);
    when(roomParticipantRepository.countByRoomIdAndConnectionStatusIn(eq(10L), any())).thenReturn(1L);
    when(roomParticipantRepository.save(any(RoomParticipant.class)))
        .thenAnswer(
            invocation -> {
              RoomParticipant participant = invocation.getArgument(0);
              ReflectionTestUtils.setField(participant, "id", 200L);
              return participant;
            });
    when(mediaSessionGateway.createConnectionToken("openvidu-session-1", 200L))
        .thenReturn("openvidu-token-2");

    // when
    RoomJoinResponse response = roomService.joinRoom(2L, "ABC123");

    // then
    assertThat(response.openViduSessionId()).isEqualTo("openvidu-session-1");
    assertThat(response.openViduToken()).isEqualTo("openvidu-token-2");
    verify(mediaSessionGateway, never()).createSession();
    verify(mediaSessionGateway).createConnectionToken("openvidu-session-1", 200L);
  }

  @Test
  @DisplayName("강퇴 이력이 있는 사용자는 기존 초대 코드 입장 API로도 다시 입장할 수 없다")
  void joinRoomRejectsKickedUser() {
    User user = user(2L);
    Room room = room(10L, "openvidu-session-1");
    when(userRepository.findById(2L)).thenReturn(Optional.of(user));
    when(roomRepository.findByInviteCodeForUpdate("ABC123"))
        .thenReturn(Optional.of(room));
    when(roomParticipantRepository.existsByRoomIdAndUserIdAndConnectionStatus(
            10L, 2L, ConnectionStatus.KICKED))
        .thenReturn(true);

    assertThatThrownBy(() -> roomService.joinRoom(2L, "ABC123"))
        .isInstanceOf(CustomException.class)
        .hasMessage("강퇴된 참가자는 다시 입장할 수 없습니다.");

    verify(roomParticipantRepository, never()).save(any());
    verifyNoInteractions(mediaSessionGateway);
  }

  @Test
  @DisplayName("활성 참가자는 방의 OpenVidu 세션에 대한 연결 토큰을 다시 발급받을 수 있다")
  void issueConnectionToken_returnsTokenForActiveParticipant() {
    // given
    Room room = room(10L, "openvidu-session-1");
    RoomParticipant participant = participant(room, 100L, ConnectionStatus.CONNECTED);
    when(roomRepository.findById(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoomIdAndUserId(10L, 2L)).thenReturn(Optional.of(participant));
    when(mediaSessionGateway.createConnectionToken("openvidu-session-1", 100L))
        .thenReturn("openvidu-token-3");

    // when
    String token = roomService.issueConnectionToken(2L, 10L);

    // then
    assertThat(token).isEqualTo("openvidu-token-3");
    verify(mediaSessionGateway).createConnectionToken("openvidu-session-1", 100L);
  }

  @Test
  @DisplayName("비활성(퇴장/강퇴) 참가자는 연결 토큰을 발급받을 수 없고, OpenVidu 게이트웨이는 호출되지 않는다")
  void issueConnectionToken_rejectsInactiveParticipantWithoutCallingGateway() {
    // given
    Room room = room(10L, "openvidu-session-1");
    RoomParticipant participant = participant(room, 100L, ConnectionStatus.LEFT);
    when(roomRepository.findById(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoomIdAndUserId(10L, 2L)).thenReturn(Optional.of(participant));

    // when & then
    assertThatThrownBy(() -> roomService.issueConnectionToken(2L, 10L))
        .isInstanceOf(CustomException.class)
        .hasMessage("활성 상태의 참가자가 아닙니다.");
    verifyNoInteractions(mediaSessionGateway);
  }

  @Test
  @DisplayName("강퇴 이력이 있는 사용자는 OpenVidu 토큰을 재발급받을 수 없다")
  void issueConnectionTokenRejectsKickedUser() {
    when(roomParticipantRepository.existsByRoomIdAndUserIdAndConnectionStatus(
            10L, 2L, ConnectionStatus.KICKED))
        .thenReturn(true);

    assertThatThrownBy(() -> roomService.issueConnectionToken(2L, 10L))
        .isInstanceOf(CustomException.class)
        .hasMessage("강퇴된 참가자는 다시 입장할 수 없습니다.");

    verifyNoInteractions(mediaSessionGateway);
  }

  @Test
  @DisplayName("방장이 방을 종료하면 해당 방의 OpenVidu 세션도 함께 종료한다")
  void terminateRoom_closesOpenViduSessionWhenHostTerminates() {
    // given
    User host = user(1L);
    Room room = room(10L, "openvidu-session-1", host);
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));

    // when
    roomService.terminateRoom(1L, 10L);

    // then
    assertThat(room.getStatus()).isEqualTo(RoomStatus.TERMINATED);
    verify(mediaSessionGateway).closeSession("openvidu-session-1");
  }

  @Test
  @DisplayName("방장이 아닌 사용자가 종료를 시도하면 예외가 발생하고, OpenVidu 세션은 종료되지 않는다")
  void terminateRoom_rejectsNonHostWithoutClosingSession() {
    // given
    User host = user(1L);
    Room room = room(10L, "openvidu-session-1", host);
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));

    // when & then
    assertThatThrownBy(() -> roomService.terminateRoom(2L, 10L))
        .isInstanceOf(CustomException.class)
        .hasMessage("방장만 수행할 수 있는 요청입니다.");
    verifyNoInteractions(mediaSessionGateway);
  }

  @Test
  @DisplayName("참가자가 명시적으로 방을 나가면 진행 중인 가창 공연 복구를 요청한다")
  void leaveRoomRequestsPerformanceRecovery() {
    Room room = room(10L, "openvidu-session-1");
    RoomParticipant participant =
        connectedParticipant(room, 100L, 2L, "participant-connection");
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoomIdAndUserId(10L, 2L))
        .thenReturn(Optional.of(participant));
    when(roomParticipantRepository.findByIdForUpdate(100L)).thenReturn(Optional.of(participant));

    roomService.leaveRoom(2L, 10L);

    assertThat(participant.isActive()).isFalse();
    verify(performanceRecoveryService)
        .recoverPerformerExitCaseWithLockedRoom(room, 2L, PerformanceCancelReason.PERFORMER_REQUEST);
    verify(mediaSessionGateway)
        .disconnect("openvidu-session-1", "participant-connection");
  }

  @Test
  @DisplayName("재접속 유예 시간이 만료된 DISCONNECTED 참가자를 실제 퇴장 처리한다")
  void leaveByConnectionExpirationLeavesDisconnectedParticipant() {
    Room room = room(10L, "openvidu-session-1");
    RoomParticipant participant = participant(room, 100L, ConnectionStatus.DISCONNECTED);
    when(roomParticipantRepository.findById(100L)).thenReturn(Optional.of(participant));
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByIdForUpdate(100L)).thenReturn(Optional.of(participant));

    roomService.leaveByConnectionExpiration(100L);

    assertThat(participant.getConnectionStatus()).isEqualTo(ConnectionStatus.LEFT);
    verify(performanceRecoveryService)
        .recoverPerformerExitCaseWithLockedRoom(room, 2L, PerformanceCancelReason.PERFORMER_DISCONNECTED);
    verify(mediaSessionGateway, never()).disconnect(any(), any());
  }

  @Test
  @DisplayName("재접속한 참가자에게 도착한 만료 작업은 실제 퇴장 처리하지 않는다")
  void leaveByConnectionExpirationIgnoresConnectedParticipant() {
    Room room = room(10L, "openvidu-session-1");
    RoomParticipant participant = participant(room, 100L, ConnectionStatus.CONNECTED);
    when(roomParticipantRepository.findById(100L)).thenReturn(Optional.of(participant));
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByIdForUpdate(100L)).thenReturn(Optional.of(participant));

    roomService.leaveByConnectionExpiration(100L);

    assertThat(participant.getConnectionStatus()).isEqualTo(ConnectionStatus.CONNECTED);
    verifyNoInteractions(performanceRecoveryService);
    verify(mediaSessionGateway, never()).disconnect(any(), any());
  }

  @Test
  @DisplayName("온라인 참가자를 강퇴하면 해당 OpenVidu 연결을 종료한다")
  void kickParticipantDisconnectsOnlineParticipant() {
    User host = user(1L);
    Room room = room(10L, "openvidu-session-1", host);
    RoomParticipant sender =
        connectedParticipant(room, 101L, 1L, "host-connection");
    RoomParticipant receiver =
        connectedParticipant(room, 100L, 2L, "participant-connection");
    when(userRepository.findById(1L)).thenReturn(Optional.of(host));
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoomIdAndUserId(10L, 1L))
        .thenReturn(Optional.of(sender));
    when(roomParticipantRepository.findByIdForUpdate(101L)).thenReturn(Optional.of(sender));
    when(roomParticipantRepository.findByIdForUpdate(100L)).thenReturn(Optional.of(receiver));

    roomService.kickParticipant(10L, 100L, 1L);

    assertThat(receiver.getConnectionStatus()).isEqualTo(ConnectionStatus.KICKED);
    verify(mediaSessionGateway)
        .disconnect("openvidu-session-1", "participant-connection");
  }

  @Test
  @DisplayName("연결이 끊긴 참가자를 강퇴하면 OpenVidu 연결 종료를 요청하지 않는다")
  void kickParticipantDoesNotDisconnectOfflineParticipant() {
    User host = user(1L);
    Room room = room(10L, "openvidu-session-1", host);
    RoomParticipant sender =
        connectedParticipant(room, 101L, 1L, "host-connection");
    RoomParticipant receiver =
        connectedParticipant(room, 100L, 2L, "participant-connection");
    receiver.disconnect(LocalDateTime.now());
    when(userRepository.findById(1L)).thenReturn(Optional.of(host));
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoomIdAndUserId(10L, 1L))
        .thenReturn(Optional.of(sender));
    when(roomParticipantRepository.findByIdForUpdate(101L)).thenReturn(Optional.of(sender));
    when(roomParticipantRepository.findByIdForUpdate(100L)).thenReturn(Optional.of(receiver));

    roomService.kickParticipant(10L, 100L, 1L);

    assertThat(receiver.getConnectionStatus()).isEqualTo(ConnectionStatus.KICKED);
    verify(mediaSessionGateway, never()).disconnect(any(), any());
  }

  private User user(Long id) {
    User user =
        User.builder()
            .email("user" + id + "@test.com")
            .nickname("사용자" + id)
            .provider(OAuthProvider.GOOGLE)
            .providerId("provider-" + id)
            .role(Role.USER)
            .build();
    ReflectionTestUtils.setField(user, "id", id);
    return user;
  }

  private Room room(Long id, String openViduSessionId) {
    return room(id, openViduSessionId, user(999L));
  }

  private Room room(Long id, String openViduSessionId, User host) {
    Room room =
        Room.create("ABC123", "테스트방", RoomMode.GENERAL, host, openViduSessionId, LocalDateTime.now());
    ReflectionTestUtils.setField(room, "id", id);
    return room;
  }

  private RoomParticipant participant(Room room, Long id, ConnectionStatus connectionStatus) {
    RoomParticipant participant = RoomParticipant.join(room, user(2L), LocalDateTime.now());
    ReflectionTestUtils.setField(participant, "id", id);
    ReflectionTestUtils.setField(participant, "connectionStatus", connectionStatus);
    return participant;
  }

  private RoomParticipant connectedParticipant(
      Room room,
      Long id,
      Long userId,
      String connectionId) {
    RoomParticipant participant =
        RoomParticipant.join(room, user(userId), LocalDateTime.now());
    ReflectionTestUtils.setField(participant, "id", id);
    participant.connect(connectionId);
    return participant;
  }
}
