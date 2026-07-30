package com.ssafy.ssasukae.domain.room.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.Set;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.ssafy.ssasukae.domain.card.service.CardService;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.service.PerformanceRecoveryService;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketEventType;
import com.ssafy.ssasukae.domain.room.websocket.payload.RoomParticipantChatPayload;
import com.ssafy.ssasukae.domain.room.websocket.request.ParticipantChatRequest;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketErrorCode;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketException;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import com.ssafy.ssasukae.global.websocket.message.WebSocketEvent;
import com.ssafy.ssasukae.global.websocket.publisher.WebSocketEventPublisher;
import com.ssafy.ssasukae.integration.openvidu.MediaSessionGateway;

@ExtendWith(MockitoExtension.class)
class RoomChatServiceTest {

  private static final Long USER_ID = 2L;
  private static final Long ROOM_ID = 10L;
  private static final Long PARTICIPANT_ID = 100L;
  private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 29, 18, 0);

  private static ValidatorFactory validatorFactory;
  private static Validator validator;

  @Mock private RoomRepository roomRepository;
  @Mock private RoomParticipantRepository roomParticipantRepository;
  @Mock private UserRepository userRepository;
  @Mock private MediaSessionGateway mediaSessionGateway;
  @Mock private PerformanceRecoveryService performanceRecoveryService;
  @Mock private WebSocketEventPublisher webSocketEventPublisher;
  @Mock private CardService cardService;
  @Mock private PerformanceStore performanceStore;

  private RoomService roomService;
  private AuthenticatedUser authenticatedUser;
  private final Clock clock =
      Clock.fixed(Instant.parse("2026-07-29T09:00:00Z"), ZoneOffset.UTC);

  @BeforeAll
  static void setUpValidator() {
    validatorFactory = Validation.buildDefaultValidatorFactory();
    validator = validatorFactory.getValidator();
  }

  @AfterAll
  static void closeValidatorFactory() {
    validatorFactory.close();
  }

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
            clock);
    authenticatedUser = new AuthenticatedUser(USER_ID, "user@test.com", "USER");
  }

  @Test
  @DisplayName("활성 참가자가 채팅을 보내면 공백을 제거한 메시지를 방 이벤트로 발행한다")
  void chatPublishesTrimmedMessageToRoom() {
    User user = user(USER_ID);
    Room room = room(user);
    RoomParticipant sender = participant(room, user);
    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
    when(roomRepository.findById(ROOM_ID)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoomIdAndUserId(ROOM_ID, USER_ID))
        .thenReturn(Optional.of(sender));

    roomService.chat(ROOM_ID, new ParticipantChatRequest("  안녕하세요!  "), authenticatedUser);

    @SuppressWarnings("rawtypes")
    ArgumentCaptor<WebSocketEvent> eventCaptor = ArgumentCaptor.forClass(WebSocketEvent.class);
    verify(webSocketEventPublisher).publishToRoom(eq(ROOM_ID), eventCaptor.capture());

    WebSocketEvent<?> event = eventCaptor.getValue();
    assertThat(event.eventType()).isEqualTo(RoomWebSocketEventType.PARTICIPANT_CHAT.value());
    assertThat(event.roomId()).isEqualTo(ROOM_ID);
    assertThat(event.payload()).isInstanceOf(RoomParticipantChatPayload.class);

    RoomParticipantChatPayload payload = (RoomParticipantChatPayload) event.payload();
    assertThat(payload.participantId()).isEqualTo(PARTICIPANT_ID);
    assertThat(payload.message()).isEqualTo("안녕하세요!");
    assertThat(payload.sendAt()).isNotNull();
  }

  @Test
  @DisplayName("종료된 방에서는 채팅을 보낼 수 없다")
  void chatRejectsTerminatedRoom() {
    User user = user(USER_ID);
    Room room = room(user);
    room.terminate(NOW);
    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
    when(roomRepository.findById(ROOM_ID)).thenReturn(Optional.of(room));

    assertThatThrownBy(
            () ->
                roomService.chat(
                    ROOM_ID, new ParticipantChatRequest("안녕하세요!"), authenticatedUser))
        .isInstanceOfSatisfying(
            WebSocketException.class,
            exception ->
                assertThat(exception.getErrorCode())
                    .isEqualTo(WebSocketErrorCode.INVALID_ROOM_STATE));

    verifyNoInteractions(webSocketEventPublisher);
  }

  @Test
  @DisplayName("방 참가자가 아닌 사용자는 채팅을 보낼 수 없다")
  void chatRejectsNonParticipant() {
    User user = user(USER_ID);
    Room room = room(user);
    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
    when(roomRepository.findById(ROOM_ID)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoomIdAndUserId(ROOM_ID, USER_ID))
        .thenReturn(Optional.empty());

    assertThatThrownBy(
            () ->
                roomService.chat(
                    ROOM_ID, new ParticipantChatRequest("안녕하세요!"), authenticatedUser))
        .isInstanceOfSatisfying(
            WebSocketException.class,
            exception ->
                assertThat(exception.getErrorCode())
                    .isEqualTo(WebSocketErrorCode.ROOM_ACCESS_DENIED));

    verifyNoInteractions(webSocketEventPublisher);
  }

  @Test
  @DisplayName("퇴장한 참가자는 채팅을 보낼 수 없다")
  void chatRejectsInactiveParticipant() {
    User user = user(USER_ID);
    Room room = room(user);
    RoomParticipant sender = participant(room, user);
    sender.leave(NOW);
    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
    when(roomRepository.findById(ROOM_ID)).thenReturn(Optional.of(room));
    when(roomParticipantRepository.findByRoomIdAndUserId(ROOM_ID, USER_ID))
        .thenReturn(Optional.of(sender));

    assertThatThrownBy(
            () ->
                roomService.chat(
                    ROOM_ID, new ParticipantChatRequest("안녕하세요!"), authenticatedUser))
        .isInstanceOfSatisfying(
            WebSocketException.class,
            exception ->
                assertThat(exception.getErrorCode())
                    .isEqualTo(WebSocketErrorCode.ACTION_NOT_ALLOWED));

    verifyNoInteractions(webSocketEventPublisher);
  }

  @Test
  @DisplayName("채팅 메시지는 비어 있을 수 없다")
  void chatRequestRejectsBlankMessage() {
    Set<ConstraintViolation<ParticipantChatRequest>> violations =
        validator.validate(new ParticipantChatRequest("   "));

    assertThat(violations)
        .extracting(violation -> violation.getPropertyPath().toString())
        .contains("message");
  }

  @Test
  @DisplayName("채팅 메시지는 300자를 초과할 수 없다")
  void chatRequestRejectsMessageOver300Characters() {
    Set<ConstraintViolation<ParticipantChatRequest>> violations =
        validator.validate(new ParticipantChatRequest("가".repeat(301)));

    assertThat(violations)
        .extracting(violation -> violation.getPropertyPath().toString())
        .contains("message");
  }

  @Test
  @DisplayName("300자 채팅 메시지는 허용한다")
  void chatRequestAcceptsMessageWith300Characters() {
    Set<ConstraintViolation<ParticipantChatRequest>> violations =
        validator.validate(new ParticipantChatRequest("가".repeat(300)));

    assertThat(violations).isEmpty();
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

  private Room room(User host) {
    Room room =
        Room.create(
            "ABC123",
            "테스트방",
            RoomMode.GENERAL,
            host,
            "openvidu-session-1",
            NOW);
    ReflectionTestUtils.setField(room, "id", ROOM_ID);
    return room;
  }

  private RoomParticipant participant(Room room, User user) {
    RoomParticipant participant = RoomParticipant.join(room, user, NOW);
    ReflectionTestUtils.setField(participant, "id", PARTICIPANT_ID);
    return participant;
  }
}
