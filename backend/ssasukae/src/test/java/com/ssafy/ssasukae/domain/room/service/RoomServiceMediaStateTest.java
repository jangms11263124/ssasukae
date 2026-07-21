package com.ssafy.ssasukae.domain.room.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import com.ssafy.ssasukae.domain.room.dto.UpdateMediaStateRequest;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.event.ParticipantMediaStateChangedDomainEvent;
import com.ssafy.ssasukae.domain.room.repository.RoomBanRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
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
class RoomServiceMediaStateTest {

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
    Clock clock = Clock.fixed(Instant.parse("2026-07-21T16:30:00Z"), ZoneOffset.UTC);
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
  @DisplayName("온라인 참가자가 자신의 미디어 상태를 변경하면 방 버전과 이벤트가 갱신된다")
  void updateMediaState_changesStateAndPublishesEvent() {
    Room room = room(10L);
    RoomParticipant participant = participant(room, user(2L, "참가자"), 102L);
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 2L))
        .thenReturn(Optional.of(participant));

    roomService.updateMediaState(10L, 2L, new UpdateMediaStateRequest(false, true));

    assertThat(participant.isMicEnabled()).isFalse();
    assertThat(participant.isCameraEnabled()).isTrue();
    assertThat(room.getVersion()).isEqualTo(2L);
    assertThat(room.getLastActivityAt()).isEqualTo(LocalDateTime.of(2026, 7, 21, 16, 30));

    ArgumentCaptor<ParticipantMediaStateChangedDomainEvent> captor =
        ArgumentCaptor.forClass(ParticipantMediaStateChangedDomainEvent.class);
    verify(applicationEventPublisher).publishEvent(captor.capture());
    assertThat(captor.getValue())
        .isEqualTo(new ParticipantMediaStateChangedDomainEvent(10L, 2L, 102L, false, true));
  }

  @Test
  @DisplayName("동일한 미디어 상태 요청은 방 버전과 이벤트를 변경하지 않는다")
  void updateMediaState_sameValuesIsIdempotent() {
    Room room = room(10L);
    RoomParticipant participant = participant(room, user(2L, "참가자"), 102L);
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 2L))
        .thenReturn(Optional.of(participant));

    roomService.updateMediaState(10L, 2L, new UpdateMediaStateRequest(true, true));

    assertThat(room.getVersion()).isEqualTo(1L);
    verify(applicationEventPublisher, never()).publishEvent(org.mockito.ArgumentMatchers.any());
  }

  @Test
  @DisplayName("연결이 끊긴 참가자는 미디어 상태를 변경할 수 없다")
  void updateMediaState_rejectsDisconnectedParticipant() {
    Room room = room(10L);
    RoomParticipant participant = participant(room, user(2L, "참가자"), 102L);
    participant.disconnect(JOINED_AT.plusMinutes(1));
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 2L))
        .thenReturn(Optional.of(participant));

    assertThatThrownBy(
            () ->
                roomService.updateMediaState(
                    10L, 2L, new UpdateMediaStateRequest(false, false)))
        .isInstanceOf(RoomException.class)
        .hasMessage("온라인 상태의 참가자만 미디어 상태를 변경할 수 있습니다.");

    assertThat(participant.getConnectionStatus()).isEqualTo(ConnectionStatus.DISCONNECTED);
    assertThat(room.getVersion()).isEqualTo(1L);
    verify(applicationEventPublisher, never()).publishEvent(org.mockito.ArgumentMatchers.any());
  }

  @Test
  @DisplayName("해당 방의 활성 참가자가 아닌 사용자는 미디어 상태를 변경할 수 없다")
  void updateMediaState_rejectsNonParticipant() {
    Room room = room(10L);
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 99L))
        .thenReturn(Optional.empty());

    assertThatThrownBy(
            () ->
                roomService.updateMediaState(
                    10L, 99L, new UpdateMediaStateRequest(false, false)))
        .isInstanceOf(RoomException.class)
        .hasMessage("방 접근 권한이 없습니다.");

    verify(applicationEventPublisher, never()).publishEvent(org.mockito.ArgumentMatchers.any());
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
