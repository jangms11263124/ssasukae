package com.ssafy.ssasukae.domain.room.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.event.ParticipantConnectionChangedDomainEvent;
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
class RoomServiceConnectionTest {

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
  @DisplayName("방장의 마지막 WebSocket이 끊기면 userId가 가장 작은 ONLINE 참가자에게 방장을 위임한다")
  void disconnectHost_transfersHostToSmallestOnlineUserId() {
    Room room = room(10L);
    RoomParticipant host = host(room, user(9L), 101L);
    RoomParticipant nextHost = participant(room, user(2L), 102L);

    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 9L))
        .thenReturn(Optional.of(host));
    when(roomParticipantRepository
            .findFirstByRoom_IdAndConnectionStatusOrderByUser_IdAsc(
                10L, ConnectionStatus.ONLINE))
        .thenReturn(Optional.of(nextHost));

    roomService.disconnectRoomWebSocket(10L, 9L);

    assertThat(host.getConnectionStatus()).isEqualTo(ConnectionStatus.DISCONNECTED);
    assertThat(host.getRole()).isEqualTo(ParticipantRole.PARTICIPANT);
    assertThat(nextHost.getRole()).isEqualTo(ParticipantRole.HOST);

    ParticipantConnectionChangedDomainEvent event = capturedEvent();
    assertThat(event.participantId()).isEqualTo(101L);
    assertThat(event.connectionStatus()).isEqualTo(ConnectionStatus.DISCONNECTED);
    assertThat(event.newHostParticipantId()).isEqualTo(102L);
    assertThat(event.hostChangedVersion()).isNotNull();
  }

  @Test
  @DisplayName("일반 참가자의 WebSocket 종료는 방장을 변경하지 않는다")
  void disconnectParticipant_doesNotChangeHost() {
    Room room = room(10L);
    RoomParticipant participant = participant(room, user(3L), 103L);

    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 3L))
        .thenReturn(Optional.of(participant));

    roomService.disconnectRoomWebSocket(10L, 3L);

    ParticipantConnectionChangedDomainEvent event = capturedEvent();
    assertThat(event.newHostParticipantId()).isNull();
    assertThat(event.hostChangedVersion()).isNull();
  }

  @Test
  @DisplayName("방이 host 없이 남아 있으면 먼저 재접속한 참가자를 방장으로 지정한다")
  void reconnectWithoutOnlineHost_promotesReconnectedParticipant() {
    Room room = room(10L);
    RoomParticipant participant = participant(room, user(3L), 103L);
    participant.disconnect(JOINED_AT.plusMinutes(1));

    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(10L, 3L))
        .thenReturn(Optional.of(participant));
    when(roomParticipantRepository.findByRoom_IdAndRole(10L, ParticipantRole.HOST))
        .thenReturn(Optional.empty());

    roomService.connectRoomWebSocket(10L, 3L);

    assertThat(participant.getConnectionStatus()).isEqualTo(ConnectionStatus.ONLINE);
    assertThat(participant.getRole()).isEqualTo(ParticipantRole.HOST);
    ParticipantConnectionChangedDomainEvent event = capturedEvent();
    assertThat(event.newHostParticipantId()).isEqualTo(103L);
    assertThat(event.hostChangedVersion()).isNotNull();
  }

  private ParticipantConnectionChangedDomainEvent capturedEvent() {
    ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
    org.mockito.Mockito.verify(applicationEventPublisher).publishEvent(captor.capture());
    return (ParticipantConnectionChangedDomainEvent) captor.getValue();
  }

  private Room room(Long roomId) {
    Room room =
        Room.create(
            user(100L),
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

  private User user(Long userId) {
    User user =
        User.builder()
            .email("user" + userId + "@test.com")
            .nickname("사용자" + userId)
            .provider(OAuthProvider.GOOGLE)
            .providerId("provider-" + userId)
            .role(Role.USER)
            .build();
    ReflectionTestUtils.setField(user, "id", userId);
    return user;
  }
}
