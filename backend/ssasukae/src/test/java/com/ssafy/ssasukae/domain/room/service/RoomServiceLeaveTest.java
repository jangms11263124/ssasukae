package com.ssafy.ssasukae.domain.room.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;

import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.event.ParticipantLeftDomainEvent;
import com.ssafy.ssasukae.global.exception.room.RoomException;
import com.ssafy.ssasukae.domain.room.repository.RoomBanRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.ParticipantLeaveReason;
import com.ssafy.ssasukae.domain.room.type.ParticipantRole;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.integration.openvidu.MediaSessionGateway;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class RoomServiceLeaveTest {

  private static final EnumSet<ConnectionStatus> ACTIVE_STATUSES =
      EnumSet.of(ConnectionStatus.ONLINE, ConnectionStatus.DISCONNECTED);
  private static final LocalDateTime JOINED_AT =
      LocalDateTime.of(2026, 7, 21, 12, 0);

  @Mock private RoomRepository roomRepository;
  @Mock private RoomParticipantRepository roomParticipantRepository;
  @Mock private RoomBanRepository roomBanRepository;
  @Mock private UserRepository userRepository;
  @Mock private RoomNamePolicy roomNamePolicy;
  @Mock private InviteCodeGenerator inviteCodeGenerator;
  @Mock private MediaSessionGateway mediaSessionGateway;
  @Mock private ApplicationEventPublisher applicationEventPublisher;

  private RoomService roomService;

  @BeforeEach
  void setUp() {
    Clock clock = Clock.fixed(Instant.parse("2026-07-21T03:30:00Z"), ZoneOffset.UTC);
    roomService =
        new RoomService(
            roomRepository,
            roomParticipantRepository,
            roomBanRepository,
            userRepository,
            roomNamePolicy,
            inviteCodeGenerator,
            mediaSessionGateway,
            applicationEventPublisher,
            clock);
  }

  @Test
  @DisplayName("일반 참가자가 퇴장하면 LEFT 상태로 변경하고 PARTICIPANT_LEFT 이벤트를 예약한다")
  void leaveRoom_changesParticipantStateAndPublishesEvent() {
    Room room = room(10L);
    RoomParticipant host = host(room, user(1L, "방장"), 101L, JOINED_AT);
    RoomParticipant leaving = participant(room, user(2L, "참가자"), 102L, JOINED_AT.plusMinutes(1));

    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 2L))
        .thenReturn(Optional.of(leaving));
    when(roomParticipantRepository.findByRoom_IdAndRole(10L, ParticipantRole.HOST))
        .thenReturn(Optional.of(host));
    when(roomParticipantRepository.countByRoom_IdAndConnectionStatusIn(10L, ACTIVE_STATUSES))
        .thenReturn(1L);

    roomService.leaveRoom(10L, 2L);

    assertThat(leaving.getConnectionStatus()).isEqualTo(ConnectionStatus.LEFT);
    assertThat(leaving.isMicEnabled()).isFalse();
    assertThat(leaving.isCameraEnabled()).isFalse();
    assertThat(room.getVersion()).isEqualTo(2L);

    ParticipantLeftDomainEvent event = capturedEvent();
    assertThat(event.roomId()).isEqualTo(10L);
    assertThat(event.participantLeftVersion()).isEqualTo(2L);
    assertThat(event.participantId()).isEqualTo(102L);
    assertThat(event.participantCount()).isEqualTo(1);
    assertThat(event.hostParticipantId()).isEqualTo(101L);
    assertThat(event.reason()).isEqualTo(ParticipantLeaveReason.LEFT);
    assertThat(event.hostChangedVersion()).isNull();
    verify(mediaSessionGateway, never()).closeSession(any());
  }

  @Test
  @DisplayName("방장이 퇴장하면 userId가 가장 작은 온라인 참가자에게 방장을 자동 위임한다")
  void leaveRoom_transfersHostToSmallestUserIdParticipant() {
    Room room = room(10L);
    RoomParticipant leavingHost = host(room, user(1L, "기존방장"), 101L, JOINED_AT);
    RoomParticipant newHost = participant(room, user(2L, "새방장"), 102L, JOINED_AT.plusMinutes(1));

    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 1L))
        .thenReturn(Optional.of(leavingHost));
    when(roomParticipantRepository.findByRoom_IdAndRole(10L, ParticipantRole.HOST))
        .thenReturn(Optional.empty());
    when(roomParticipantRepository
            .findFirstByRoom_IdAndConnectionStatusOrderByUser_IdAsc(
                10L, ConnectionStatus.ONLINE))
        .thenReturn(Optional.of(newHost));
    when(roomParticipantRepository.countByRoom_IdAndConnectionStatusIn(10L, ACTIVE_STATUSES))
        .thenReturn(1L);

    roomService.leaveRoom(10L, 1L);

    assertThat(leavingHost.getConnectionStatus()).isEqualTo(ConnectionStatus.LEFT);
    assertThat(leavingHost.getRole()).isEqualTo(ParticipantRole.PARTICIPANT);
    assertThat(newHost.getRole()).isEqualTo(ParticipantRole.HOST);
    assertThat(room.getVersion()).isEqualTo(3L);

    ParticipantLeftDomainEvent event = capturedEvent();
    assertThat(event.participantLeftVersion()).isEqualTo(2L);
    assertThat(event.hostChangedVersion()).isEqualTo(3L);
    assertThat(event.hostParticipantId()).isEqualTo(102L);
  }

  @Test
  @DisplayName("마지막 방장이 퇴장하면 방과 Mock 미디어 세션을 종료한다")
  void leaveRoom_finishesRoomWhenNoOnlineParticipantRemains() {
    Room room = room(10L);
    RoomParticipant leavingHost = host(room, user(1L, "방장"), 101L, JOINED_AT);

    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 1L))
        .thenReturn(Optional.of(leavingHost));
    when(roomParticipantRepository.findByRoom_IdAndRole(10L, ParticipantRole.HOST))
        .thenReturn(Optional.empty());
    when(roomParticipantRepository
            .findFirstByRoom_IdAndConnectionStatusOrderByUser_IdAsc(
                10L, ConnectionStatus.ONLINE))
        .thenReturn(Optional.empty());
    when(roomParticipantRepository.findAllByRoom_IdOrderByJoinedAtAsc(10L))
        .thenReturn(List.of(leavingHost));
    when(roomParticipantRepository.countByRoom_IdAndConnectionStatusIn(10L, ACTIVE_STATUSES))
        .thenReturn(0L);

    roomService.leaveRoom(10L, 1L);

    assertThat(room.getStatus()).isEqualTo(RoomStatus.FINISHED);
    assertThat(room.getFinishedAt()).isNotNull();
    verify(mediaSessionGateway).closeSession("mock-session-10");

    ParticipantLeftDomainEvent event = capturedEvent();
    assertThat(event.participantCount()).isZero();
    assertThat(event.hostParticipantId()).isNull();
    assertThat(event.hostChangedVersion()).isNull();
  }

  @Test
  @DisplayName("활성 참가자가 아닌 사용자는 방을 퇴장할 수 없다")
  void leaveRoom_rejectsUserWhoIsNotActiveParticipant() {
    Room room = room(10L);
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 99L))
        .thenReturn(Optional.empty());

    assertThatThrownBy(() -> roomService.leaveRoom(10L, 99L))
        .isInstanceOf(RoomException.class)
        .hasMessage("방 접근 권한이 없습니다.");

    verify(applicationEventPublisher, never()).publishEvent(any());
  }

  private ParticipantLeftDomainEvent capturedEvent() {
    ArgumentCaptor<ParticipantLeftDomainEvent> captor =
        ArgumentCaptor.forClass(ParticipantLeftDomainEvent.class);
    verify(applicationEventPublisher).publishEvent(captor.capture());
    return captor.getValue();
  }

  private Room room(Long roomId) {
    Room room =
        Room.create(
            user(100L, "생성자"),
            "ABC123",
            "테스트방",
            RoomMode.GENERAL,
            4,
            "mock-session-10",
            JOINED_AT);
    ReflectionTestUtils.setField(room, "id", roomId);
    return room;
  }

  private RoomParticipant host(Room room, User user, Long participantId, LocalDateTime joinedAt) {
    RoomParticipant participant = RoomParticipant.host(room, user, joinedAt);
    ReflectionTestUtils.setField(participant, "id", participantId);
    return participant;
  }

  private RoomParticipant participant(
      Room room, User user, Long participantId, LocalDateTime joinedAt) {
    RoomParticipant participant = RoomParticipant.participant(room, user, joinedAt);
    ReflectionTestUtils.setField(participant, "id", participantId);
    return participant;
  }

  private User user(Long userId, String nickname) {
    User user =
        User.builder()
            .email("user" + userId + "@test.com")
            .nickname(nickname)
            .provider(OAuthProvider.GOOGLE)
            .providerId("provider-" + userId)
            .role(Role.USER)
            .build();
    ReflectionTestUtils.setField(user, "id", userId);
    return user;
  }
}
