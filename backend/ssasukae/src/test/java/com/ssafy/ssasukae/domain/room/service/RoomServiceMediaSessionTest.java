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
import java.util.Optional;

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
import com.ssafy.ssasukae.integration.openvidu.MediaSessionGateway;

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

  private RoomService roomService;

  @BeforeEach
  void setUp() {
    roomService =
        new RoomService(roomRepository, roomParticipantRepository, userRepository, mediaSessionGateway);
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
    when(roomRepository.findByInviteCode("ABC123")).thenReturn(Optional.of(room));
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
  @DisplayName("방장이 방을 종료하면 해당 방의 OpenVidu 세션도 함께 종료한다")
  void terminateRoom_closesOpenViduSessionWhenHostTerminates() {
    // given
    User host = user(1L);
    Room room = room(10L, "openvidu-session-1", host);
    when(roomRepository.findById(10L)).thenReturn(Optional.of(room));

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
    when(roomRepository.findById(10L)).thenReturn(Optional.of(room));

    // when & then
    assertThatThrownBy(() -> roomService.terminateRoom(2L, 10L))
        .isInstanceOf(CustomException.class)
        .hasMessage("방장만 수행할 수 있는 요청입니다.");
    verifyNoInteractions(mediaSessionGateway);
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
}
