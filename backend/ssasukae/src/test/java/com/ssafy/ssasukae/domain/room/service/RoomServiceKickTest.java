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
import java.util.Optional;

import com.ssafy.ssasukae.domain.room.dto.JoinRoomRequest;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomBan;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.event.ParticipantKickedDomainEvent;
import com.ssafy.ssasukae.domain.room.repository.RoomBanRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.ParticipantRole;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.room.RoomException;
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
class RoomServiceKickTest {

  private static final EnumSet<ConnectionStatus> ACTIVE_STATUSES =
      EnumSet.of(ConnectionStatus.ONLINE, ConnectionStatus.DISCONNECTED);
  private static final LocalDateTime JOINED_AT = LocalDateTime.of(2026, 7, 22, 1, 0);

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
    Clock clock = Clock.fixed(Instant.parse("2026-07-21T16:10:00Z"), ZoneOffset.UTC);
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
  @DisplayName("온라인 방장이 활성 참가자를 강퇴하면 KICKED 상태와 차단 기록을 저장한다")
  void kickParticipant_changesStateCreatesBanAndPublishesEvent() {
    Room room = room(10L);
    User hostUser = user(1L, "방장");
    User targetUser = user(2L, "대상");
    RoomParticipant host = host(room, hostUser, 101L);
    RoomParticipant target = participant(room, targetUser, 102L);

    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 1L))
        .thenReturn(Optional.of(host));
    when(roomParticipantRepository.findByIdAndRoom_Id(102L, 10L))
        .thenReturn(Optional.of(target));
    when(roomParticipantRepository.countByRoom_IdAndConnectionStatusIn(10L, ACTIVE_STATUSES))
        .thenReturn(1L);

    roomService.kickParticipant(10L, 102L, 1L);

    assertThat(target.getConnectionStatus()).isEqualTo(ConnectionStatus.KICKED);
    assertThat(target.getRole()).isEqualTo(ParticipantRole.PARTICIPANT);
    assertThat(target.isMicEnabled()).isFalse();
    assertThat(target.isCameraEnabled()).isFalse();
    assertThat(target.getLeftAt()).isNotNull();
    assertThat(room.getVersion()).isEqualTo(2L);

    ArgumentCaptor<RoomBan> banCaptor = ArgumentCaptor.forClass(RoomBan.class);
    verify(roomBanRepository).save(banCaptor.capture());
    assertThat(banCaptor.getValue().getRoom()).isSameAs(room);
    assertThat(banCaptor.getValue().getUser()).isSameAs(targetUser);
    assertThat(banCaptor.getValue().getKickedBy()).isSameAs(hostUser);

    ParticipantKickedDomainEvent event = capturedEvent();
    assertThat(event.roomId()).isEqualTo(10L);
    assertThat(event.version()).isEqualTo(2L);
    assertThat(event.participantId()).isEqualTo(102L);
    assertThat(event.userId()).isEqualTo(2L);
    assertThat(event.nickname()).isEqualTo("대상");
    assertThat(event.kickedByUserId()).isEqualTo(1L);
    assertThat(event.participantCount()).isEqualTo(1);
  }

  @Test
  @DisplayName("일반 참가자는 다른 참가자를 강퇴할 수 없다")
  void kickParticipant_rejectsNonHost() {
    Room room = room(10L);
    RoomParticipant requester = participant(room, user(1L, "요청자"), 101L);

    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 1L))
        .thenReturn(Optional.of(requester));

    assertThatThrownBy(() -> roomService.kickParticipant(10L, 102L, 1L))
        .isInstanceOf(RoomException.class)
        .hasMessage("방장만 참가자를 강퇴할 수 있습니다.");

    verify(roomBanRepository, never()).save(any());
    verify(applicationEventPublisher, never()).publishEvent(any());
  }

  @Test
  @DisplayName("방장은 자신을 강퇴할 수 없다")
  void kickParticipant_rejectsSelfKick() {
    Room room = room(10L);
    RoomParticipant host = host(room, user(1L, "방장"), 101L);

    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 1L))
        .thenReturn(Optional.of(host));
    when(roomParticipantRepository.findByIdAndRoom_Id(101L, 10L))
        .thenReturn(Optional.of(host));

    assertThatThrownBy(() -> roomService.kickParticipant(10L, 101L, 1L))
        .isInstanceOf(RoomException.class)
        .hasMessage("방장은 자신을 강퇴할 수 없습니다.");
  }

  @Test
  @DisplayName("이미 퇴장한 참가자는 다시 강퇴할 수 없다")
  void kickParticipant_rejectsInactiveTarget() {
    Room room = room(10L);
    RoomParticipant host = host(room, user(1L, "방장"), 101L);
    RoomParticipant target = participant(room, user(2L, "대상"), 102L);
    target.leave(JOINED_AT.plusMinutes(1));

    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 1L))
        .thenReturn(Optional.of(host));
    when(roomParticipantRepository.findByIdAndRoom_Id(102L, 10L))
        .thenReturn(Optional.of(target));

    assertThatThrownBy(() -> roomService.kickParticipant(10L, 102L, 1L))
        .isInstanceOf(RoomException.class)
        .hasMessage("이미 퇴장했거나 강퇴된 참가자입니다.");
  }

  @Test
  @DisplayName("차단 기록이 있는 사용자는 참가자 레코드가 없어도 재입장할 수 없다")
  void joinRoom_rejectsRoomBan() {
    Room room = room(10L);
    User bannedUser = user(2L, "차단사용자");
    when(userRepository.findById(2L)).thenReturn(Optional.of(bannedUser));
    when(roomRepository.findByInviteCodeForUpdate("ABC123")).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 2L))
        .thenReturn(Optional.empty());
    when(roomBanRepository.existsByRoom_IdAndUser_Id(10L, 2L)).thenReturn(true);

    assertThatThrownBy(
            () -> roomService.joinRoom(2L, new JoinRoomRequest("abc123")))
        .isInstanceOf(RoomException.class)
        .hasMessage("강제 퇴장된 방에는 재입장할 수 없습니다.");

    verify(mediaSessionGateway, never()).createConnectionToken(any(), any());
  }

  private ParticipantKickedDomainEvent capturedEvent() {
    ArgumentCaptor<ParticipantKickedDomainEvent> captor =
        ArgumentCaptor.forClass(ParticipantKickedDomainEvent.class);
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

  private RoomParticipant host(Room room, User user, Long participantId) {
    RoomParticipant participant = RoomParticipant.host(room, user, JOINED_AT);
    ReflectionTestUtils.setField(participant, "id", participantId);
    return participant;
  }

  private RoomParticipant participant(Room room, User user, Long participantId) {
    RoomParticipant participant = RoomParticipant.participant(room, user, JOINED_AT);
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
