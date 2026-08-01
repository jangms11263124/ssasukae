package com.ssafy.ssasukae.domain.room.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import com.ssafy.ssasukae.domain.card.service.CardService;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.global.websocket.publisher.WebSocketEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.ssafy.ssasukae.domain.performance.service.PerformanceRecoveryService;
import com.ssafy.ssasukae.domain.room.dto.RoomSnapshotResponse;
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
import com.ssafy.ssasukae.integration.openvidu.MediaSessionGateway;
import com.ssafy.ssasukae.integration.aws.S3StorageService;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;

@ExtendWith(MockitoExtension.class)
class RoomInfoGetTest {

  private static final Long ROOM_ID = 10L;
  private static final Long REQUESTER_USER_ID = 2L;

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
          Clock.fixed(
                  Instant.parse("2026-07-30T00:00:00Z"),
                  ZoneOffset.UTC);
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
  @DisplayName("활성 참가자가 방 정보를 조회하면 현재 방 상태와 활성 참가자 목록을 반환한다")
  void getRoomSnapshotReturnsCurrentRoomAndActiveParticipants() {
    Room room = room();
    RoomParticipant hostParticipant =
        participant(room, room.getHost(), 100L, ConnectionStatus.CONNECTED);
    RoomParticipant requester =
        participant(room, user(REQUESTER_USER_ID), 200L, ConnectionStatus.CONNECTED);

    when(roomRepository.findById(ROOM_ID)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoomIdAndUserId(ROOM_ID, REQUESTER_USER_ID))
        .thenReturn(Optional.of(requester));
    when(roomParticipantRepository
            .findAllByRoomIdAndConnectionStatusInOrderByJoinedAtAsc(eq(ROOM_ID), any()))
        .thenReturn(List.of(hostParticipant, requester));

    RoomSnapshotResponse response =
        roomService.getRoomSnapshot(REQUESTER_USER_ID, ROOM_ID);

    assertThat(response.name()).isEqualTo("테스트방");
    assertThat(response.mode()).isEqualTo(RoomMode.GENERAL);
    assertThat(response.status()).isEqualTo(RoomStatus.PREPARING);
    assertThat(response.hostUserId()).isEqualTo(1L);
    assertThat(response.maxParticipants()).isEqualTo(Room.MAX_PARTICIPANTS);
    assertThat(response.participants())
        .extracting(
            item -> item.participantId(),
            item -> item.userId(),
            item -> item.nickname(),
            item -> item.host())
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple(100L, 1L, "사용자1", true),
            org.assertj.core.groups.Tuple.tuple(200L, 2L, "사용자2", false));
    verifyNoInteractions(mediaSessionGateway);
  }

  @Test
  @DisplayName("퇴장한 참가자는 방 정보를 조회할 수 없다")
  void getRoomSnapshotRejectsInactiveParticipant() {
    Room room = room();
    RoomParticipant requester =
        participant(room, user(REQUESTER_USER_ID), 200L, ConnectionStatus.LEFT);

    when(roomRepository.findById(ROOM_ID)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoomIdAndUserId(ROOM_ID, REQUESTER_USER_ID))
        .thenReturn(Optional.of(requester));

    assertThatThrownBy(() -> roomService.getRoomSnapshot(REQUESTER_USER_ID, ROOM_ID))
        .isInstanceOf(CustomException.class)
        .hasMessage("활성 상태의 참가자가 아닙니다.");

    verify(roomParticipantRepository, never())
        .findAllByRoomIdAndConnectionStatusInOrderByJoinedAtAsc(eq(ROOM_ID), any());
  }

  @Test
  @DisplayName("방 참가자가 아닌 사용자는 방 정보를 조회할 수 없다")
  void getRoomSnapshotRejectsNonParticipant() {
    when(roomRepository.findById(ROOM_ID)).thenReturn(Optional.of(room()));
    when(roomParticipantRepository.findByRoomIdAndUserId(ROOM_ID, REQUESTER_USER_ID))
        .thenReturn(Optional.empty());

    assertThatThrownBy(() -> roomService.getRoomSnapshot(REQUESTER_USER_ID, ROOM_ID))
        .isInstanceOf(CustomException.class)
        .hasMessage("존재하지 않는 참가자입니다.");

    verify(roomParticipantRepository, never())
        .findAllByRoomIdAndConnectionStatusInOrderByJoinedAtAsc(eq(ROOM_ID), any());
  }

  private Room room() {
    Room room =
        Room.create(
            "ABC123",
            "테스트방",
            RoomMode.GENERAL,
            user(1L),
            "openvidu-session-1",
            LocalDateTime.now());
    ReflectionTestUtils.setField(room, "id", ROOM_ID);
    return room;
  }

  private RoomParticipant participant(
      Room room, User user, Long participantId, ConnectionStatus connectionStatus) {
    RoomParticipant participant = RoomParticipant.join(room, user, LocalDateTime.now());
    ReflectionTestUtils.setField(participant, "id", participantId);
    ReflectionTestUtils.setField(participant, "connectionStatus", connectionStatus);
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
