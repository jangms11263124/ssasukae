package com.ssafy.ssasukae.domain.lowlatency.websocket;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.messaging.Message;
import org.springframework.messaging.support.GenericMessage;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.CloseStatus;

import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryProperties;
import com.ssafy.ssasukae.domain.performance.service.PerformanceConnectionRecoveryService;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.recovery.ParticipantReconnectDeadlineStore;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import com.ssafy.ssasukae.global.websocket.publisher.WebSocketEventPublisher;

/**
 * 저지연 프레즌스 리스너가 LOW_LATENCY 방에만 관여하는지 못 박는다.
 *
 * <p>STOMP 는 웹 사용자도 쓰기 때문에, 모드 격리가 깨지면 일반 모드 참가자가 탭을 닫을
 * 때마다 이 리스너가 끼어들어 프레즌스 이벤트가 중복되고 공연이 잘못 일시 중지된다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LowLatencyPresenceListenerTest {

  private static final Long USER_ID = 7L;
  private static final Long ROOM_ID = 12L;
  private static final Long PARTICIPANT_ID = 100L;

  @Mock private RoomRepository roomRepository;
  @Mock private RoomParticipantRepository roomParticipantRepository;
  @Mock private ParticipantReconnectDeadlineStore deadlineStore;
  @Mock private PerformanceConnectionRecoveryService performanceConnectionRecoveryService;
  @Mock private WebSocketEventPublisher webSocketEventPublisher;

  private final PerformanceRecoveryProperties recoveryProperties =
      new PerformanceRecoveryProperties();

  @InjectMocks private LowLatencyPresenceListener listener;

  private LowLatencyPresenceListener listener() {
    ReflectionTestUtils.setField(listener, "recoveryProperties", recoveryProperties);
    recoveryProperties.setPerformerDisconnectGrace(Duration.ofSeconds(15));
    return listener;
  }

  @Test
  @DisplayName("저지연 방 참가자의 STOMP 연결이 끊기면 유예를 걸고 공연 중단을 요청한다")
  void disconnectMarksLowLatencyParticipantOffline() {
    Room room = room(RoomMode.LOW_LATENCY);
    RoomParticipant participant = connectedParticipant(room);
    stubLookup(room, participant);

    listener().onDisconnected(disconnectEvent(principal()));

    assertThat(participant.getConnectionStatus()).isEqualTo(ConnectionStatus.DISCONNECTED);
    verify(deadlineStore).save(any(), any());
    verify(performanceConnectionRecoveryService)
        .suspendForPerformerDisconnectWithLockedRoom(room, participant);
  }

  @Test
  @DisplayName("일반 모드 방에서는 아무것도 하지 않는다")
  void generalRoomIsUntouched() {
    Room room = room(RoomMode.GENERAL);
    RoomParticipant participant = connectedParticipant(room);
    stubLookup(room, participant);

    listener().onDisconnected(disconnectEvent(principal()));

    assertThat(participant.getConnectionStatus()).isEqualTo(ConnectionStatus.CONNECTED);
    verifyNoInteractions(deadlineStore, performanceConnectionRecoveryService);
    verify(webSocketEventPublisher, never()).publishToRoom(any(), any());
    // 잠금 없는 모드 확인에서 걸러져야 한다. 방 행에 쓰기 잠금이 걸리면
    // 일반 모드 사용자가 페이지를 열고 닫을 때마다 입장·퇴장과 경합한다.
    verify(roomRepository, never()).findByIdForUpdate(any());
  }

  @Test
  @DisplayName("유예 안에 STOMP 가 돌아오면 다시 온라인으로 돌린다")
  void reconnectRestoresParticipant() {
    Room room = room(RoomMode.LOW_LATENCY);
    RoomParticipant participant = connectedParticipant(room);
    participant.disconnect(LocalDateTime.now());
    stubLookup(room, participant);

    listener().onConnected(connectedEvent(principal()));

    assertThat(participant.getConnectionStatus()).isEqualTo(ConnectionStatus.CONNECTED);
  }

  @Test
  @DisplayName("인증 전에 끊긴 세션은 무시한다")
  void anonymousDisconnectIsIgnored() {
    listener().onDisconnected(disconnectEvent(null));

    verifyNoInteractions(roomParticipantRepository, deadlineStore);
  }

  private void stubLookup(Room room, RoomParticipant participant) {
    when(roomParticipantRepository.findFirstByUserIdAndConnectionStatusInOrderByJoinedAtDescIdDesc(
            eq(USER_ID), any()))
        .thenReturn(Optional.of(participant));
    // 모드는 잠금 없는 조회로 먼저 확인한다.
    when(roomRepository.findModeById(ROOM_ID)).thenReturn(Optional.of(room.getMode()));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByIdForUpdate(PARTICIPANT_ID))
        .thenReturn(Optional.of(participant));
  }

  private Principal principal() {
    return new AuthenticatedUser(USER_ID, "user@test.com", Role.USER.name());
  }

  private SessionDisconnectEvent disconnectEvent(Principal principal) {
    Message<byte[]> message = new GenericMessage<>(new byte[0]);
    return new SessionDisconnectEvent(this, message, "session-1", CloseStatus.NORMAL, principal);
  }

  private SessionConnectedEvent connectedEvent(Principal principal) {
    Message<byte[]> message = new GenericMessage<>(new byte[0]);
    return new SessionConnectedEvent(this, message, principal);
  }

  private Room room(RoomMode mode) {
    User host =
        User.builder()
            .email("host@test.com")
            .nickname("호스트")
            .provider(OAuthProvider.GOOGLE)
            .providerId("provider-1")
            .role(Role.USER)
            .build();
    ReflectionTestUtils.setField(host, "id", 1L);
    Room room = Room.create("ABC123", "테스트방", mode, host, "openvidu-session", LocalDateTime.now());
    ReflectionTestUtils.setField(room, "id", ROOM_ID);
    return room;
  }

  private RoomParticipant connectedParticipant(Room room) {
    User user =
        User.builder()
            .email("user@test.com")
            .nickname("참가자")
            .provider(OAuthProvider.GOOGLE)
            .providerId("provider-7")
            .role(Role.USER)
            .build();
    ReflectionTestUtils.setField(user, "id", USER_ID);
    RoomParticipant participant = RoomParticipant.join(room, user, LocalDateTime.now());
    ReflectionTestUtils.setField(participant, "id", PARTICIPANT_ID);
    // 저지연 참가자는 OpenVidu connectionId 없이 온라인이 된다.
    participant.reconnect(null);
    return participant;
  }
}
