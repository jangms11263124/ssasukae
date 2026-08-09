package com.ssafy.ssasukae.domain.card.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.ssafy.ssasukae.domain.card.entity.Card;
import com.ssafy.ssasukae.domain.card.redis.CardAssignmentSnapshot;
import com.ssafy.ssasukae.domain.card.redis.CardAssignmentStatus;
import com.ssafy.ssasukae.domain.card.redis.CardStateStore;
import com.ssafy.ssasukae.domain.card.redis.RoomCardSnapshot;
import com.ssafy.ssasukae.domain.card.redis.RoomCardStatus;
import com.ssafy.ssasukae.domain.card.repository.CardRepository;
import com.ssafy.ssasukae.domain.card.type.CardTier;
import com.ssafy.ssasukae.domain.card.websocket.CardWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectTargetType;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketBusinessException;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketErrorCode;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CardServiceTest {

  private static final Long USER_ID = 7L;
  private static final Long ROOM_ID = 10L;
  private static final Long PERFORMANCE_ID = 1006L;
  private static final Long PARTICIPANT_ID = 15L;
  private static final Long PERFORMER_ID = 11L;
  private static final Instant NOW = Instant.parse("2026-07-29T11:00:00Z");

  @Mock private RoomRepository roomRepository;
  @Mock private RoomParticipantRepository participantRepository;
  @Mock private CardRepository cardRepository;
  @Mock private PerformanceStore performanceStore;
  @Mock private CardStateStore cardStateStore;
  @Mock private CardWebSocketEventPublisher eventPublisher;
  @Mock private TaskScheduler taskScheduler;
  @Mock private Room room;
  @Mock private RoomParticipant participant;

  private CardService cardService;
  private PerformanceSnapShot performance;
  private CardAssignmentSnapshot assignment;

  @Test
  void assignmentStartsInAnIndependentTransaction() throws NoSuchMethodException {
    Transactional transactional =
        CardService.class
            .getMethod("assignForPlayback", PerformanceSnapShot.class)
            .getAnnotation(Transactional.class);

    assertThat(transactional).isNotNull();
    assertThat(transactional.propagation()).isEqualTo(Propagation.REQUIRES_NEW);
  }

  @BeforeEach
  void setUp() {
    cardService =
        new CardService(
            roomRepository,
            participantRepository,
            cardRepository,
            performanceStore,
            cardStateStore,
            eventPublisher,
            taskScheduler,
            Clock.fixed(NOW, ZoneOffset.UTC));

    OffsetDateTime preparedAt = OffsetDateTime.parse("2026-07-29T19:58:00+09:00");
    performance =
        PerformanceSnapShot.prepare(
                PERFORMANCE_ID, ROOM_ID, PERFORMER_ID, 3L, 99L, 210_000L, preparedAt)
            .startPlayback(preparedAt.plusMinutes(1));
    assignment =
        new CardAssignmentSnapshot(
            ROOM_ID,
            PERFORMANCE_ID,
            PARTICIPANT_ID,
            USER_ID,
            3L,
            "KEY_DOWN_3",
            "키 3단계 내리기",
            "가창자의 MR 키를 3반음 낮춥니다.",
            CardEffectType.MR_KEY_CHANGE,
            CardEffectTargetType.PERFORMER,
            -3,
            15,
            CardTier.G,
            CardAssignmentStatus.ASSIGNED,
            OffsetDateTime.parse("2026-07-29T19:59:01+09:00"),
            null);

    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));
    when(room.getMode()).thenReturn(RoomMode.BATTLE);
    when(room.getStatus()).thenReturn(RoomStatus.PLAYING);
    when(participantRepository.findByRoomIdAndUserId(ROOM_ID, USER_ID))
        .thenReturn(Optional.of(participant));
    when(participant.getId()).thenReturn(PARTICIPANT_ID);
    when(participant.isOnline()).thenReturn(true);
    when(performanceStore.findActiveByRoomId(ROOM_ID)).thenReturn(Optional.of(performance));
    when(cardStateStore.findAssignment(ROOM_ID, PERFORMANCE_ID, PARTICIPANT_ID))
        .thenReturn(Optional.of(assignment));
    when(cardStateStore.findRoomCard(ROOM_ID)).thenReturn(Optional.empty());
  }

  @Test
  void cardEffectDoesNotChangeBasePerformanceSettings() {
    cardService.activate(USER_ID, ROOM_ID, PERFORMANCE_ID);

    ArgumentCaptor<RoomCardSnapshot> roomCardCaptor =
        ArgumentCaptor.forClass(RoomCardSnapshot.class);
    verify(cardStateStore).saveRoomCard(roomCardCaptor.capture());
    RoomCardSnapshot pending = roomCardCaptor.getValue();
    when(cardStateStore.findRoomCard(ROOM_ID)).thenReturn(Optional.of(pending));

    ArgumentCaptor<Runnable> activationCaptor = ArgumentCaptor.forClass(Runnable.class);
    verify(taskScheduler).schedule(activationCaptor.capture(), any(Instant.class));
    activationCaptor.getValue().run();

    verify(performanceStore, never()).replace(any(), any());
    verify(cardStateStore, times(2)).saveRoomCard(roomCardCaptor.capture());
    RoomCardSnapshot active = roomCardCaptor.getAllValues().get(2);
    assertThat(active.status()).isEqualTo(RoomCardStatus.ACTIVE);
    assertThat(active.previousValue()).isNull();
  }

  @Test
  void assignsEachDrawableCardOnlyOnceDuringPlayback() {
    RoomParticipant participant2 = mock(RoomParticipant.class);
    RoomParticipant participant3 = mock(RoomParticipant.class);
    User user1 = mock(User.class);
    User user2 = mock(User.class);
    User user3 = mock(User.class);

    when(room.getId()).thenReturn(ROOM_ID);
    when(participant.getId()).thenReturn(21L);
    when(participant.getUser()).thenReturn(user1);
    when(user1.getId()).thenReturn(201L);
    when(participant2.getId()).thenReturn(22L);
    when(participant2.getUser()).thenReturn(user2);
    when(user2.getId()).thenReturn(202L);
    when(participant3.getId()).thenReturn(23L);
    when(participant3.getUser()).thenReturn(user3);
    when(user3.getId()).thenReturn(203L);
    when(participantRepository.findAllByRoomIdAndConnectionStatusIn(
            ROOM_ID, List.of(ConnectionStatus.CONNECTED)))
        .thenReturn(List.of(participant, participant2, participant3));
    Card card1 = drawableCard(1L, "CARD_1");
    Card card2 = drawableCard(2L, "CARD_2");
    Card card3 = drawableCard(3L, "CARD_3");
    when(cardRepository.findAll()).thenReturn(List.of(card1, card2, card3));

    cardService.assignForPlayback(performance);

    ArgumentCaptor<CardAssignmentSnapshot> captor =
        ArgumentCaptor.forClass(CardAssignmentSnapshot.class);
    verify(cardStateStore, times(3)).saveAssignment(captor.capture());
    assertThat(captor.getAllValues())
        .extracting(CardAssignmentSnapshot::participantId)
        .containsExactlyInAnyOrder(21L, 22L, 23L);
    assertThat(captor.getAllValues())
        .extracting(CardAssignmentSnapshot::cardId)
        .containsExactlyInAnyOrder(1L, 2L, 3L);
  }

  @Test
  void activationIsRejectedWhenAnotherCardEffectIsActive() {
    RoomCardSnapshot activeRoomCard =
        new RoomCardSnapshot(
            ROOM_ID,
            PERFORMANCE_ID,
            RoomCardStatus.ACTIVE,
            16L,
            PERFORMER_ID,
            3L,
            "KEY_DOWN_3",
            "Key Down",
            "Lowers the MR key.",
            CardEffectType.MR_KEY_CHANGE,
            CardEffectTargetType.PERFORMER,
            -3,
            15,
            0,
            OffsetDateTime.parse("2026-07-29T19:59:50+09:00"),
            OffsetDateTime.parse("2026-07-29T19:59:53+09:00"),
            OffsetDateTime.parse("2026-07-29T19:59:53+09:00"),
            OffsetDateTime.parse("2026-07-29T20:00:08+09:00"));
    when(cardStateStore.findRoomCard(ROOM_ID)).thenReturn(Optional.of(activeRoomCard));

    assertThatThrownBy(() -> cardService.activate(USER_ID, ROOM_ID, PERFORMANCE_ID))
        .isInstanceOfSatisfying(
            WebSocketBusinessException.class,
            exception ->
                assertThat(exception.getErrorCode())
                    .isEqualTo(WebSocketErrorCode.CARD_EFFECT_ALREADY_ACTIVE));

    verify(performanceStore, never()).save(any());
    verify(taskScheduler, never()).schedule(any(Runnable.class), any(Instant.class));
  }

  private Card drawableCard(Long id, String code) {
    Card card = mock(Card.class);
    when(card.isDrawable()).thenReturn(true);
    when(card.getId()).thenReturn(id);
    when(card.getCode()).thenReturn(code);
    when(card.getName()).thenReturn(code);
    when(card.getDescription()).thenReturn(code);
    when(card.getEffectType()).thenReturn(CardEffectType.MR_KEY_CHANGE);
    when(card.getTargetType()).thenReturn(CardEffectTargetType.PERFORMER);
    when(card.getEffectValue()).thenReturn(-1);
    when(card.getDurationSeconds()).thenReturn(15);
    when(card.getTier()).thenReturn(CardTier.G);
    return card;
  }
}
