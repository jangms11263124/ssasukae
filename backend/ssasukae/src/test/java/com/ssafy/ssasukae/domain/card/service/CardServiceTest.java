package com.ssafy.ssasukae.domain.card.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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

import com.ssafy.ssasukae.domain.card.redis.CardAssignmentSnapshot;
import com.ssafy.ssasukae.domain.card.redis.CardAssignmentStatus;
import com.ssafy.ssasukae.domain.card.redis.CardStateStore;
import com.ssafy.ssasukae.domain.card.redis.RoomCardSnapshot;
import com.ssafy.ssasukae.domain.card.redis.RoomCardStatus;
import com.ssafy.ssasukae.domain.card.repository.CardRepository;
import com.ssafy.ssasukae.domain.card.type.CardTier;
import com.ssafy.ssasukae.domain.card.websocket.CardWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.card.websocket.CardWebSocketEventType;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectTargetType;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
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
            "https://cdn.test/cards/key-down-3.webp",
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
  void activationSavesTheRoomCardAndPausesPlayback() {
    cardService.activate(USER_ID, ROOM_ID, PERFORMANCE_ID);

    ArgumentCaptor<PerformanceSnapShot> performanceCaptor =
        ArgumentCaptor.forClass(PerformanceSnapShot.class);
    verify(performanceStore).save(performanceCaptor.capture());
    assertThat(performanceCaptor.getValue().isPausedForCard()).isTrue();
    assertThat(performanceCaptor.getValue().playbackPositionMs()).isEqualTo(60_000L);
    verify(cardStateStore).saveRoomCard(any(RoomCardSnapshot.class));
    verify(eventPublisher)
        .publishToRoom(
            org.mockito.ArgumentMatchers.eq(ROOM_ID),
            org.mockito.ArgumentMatchers.eq(CardWebSocketEventType.CARD_ACTIVATION_SCHEDULED),
            any());
    verify(taskScheduler)
        .schedule(any(Runnable.class), org.mockito.ArgumentMatchers.eq(NOW.plusSeconds(3)));
  }

  @Test
  void scheduledActivationMarksTheAssignmentUsedAndStartsTheEffect() {
    cardService.activate(USER_ID, ROOM_ID, PERFORMANCE_ID);

    ArgumentCaptor<PerformanceSnapShot> pausedCaptor =
        ArgumentCaptor.forClass(PerformanceSnapShot.class);
    ArgumentCaptor<RoomCardSnapshot> pendingCaptor =
        ArgumentCaptor.forClass(RoomCardSnapshot.class);
    ArgumentCaptor<Runnable> countdownCaptor = ArgumentCaptor.forClass(Runnable.class);
    verify(performanceStore).save(pausedCaptor.capture());
    verify(cardStateStore).saveRoomCard(pendingCaptor.capture());
    verify(taskScheduler)
        .schedule(countdownCaptor.capture(), org.mockito.ArgumentMatchers.eq(NOW.plusSeconds(3)));

    PerformanceSnapShot paused = pausedCaptor.getValue();
    RoomCardSnapshot pending = pendingCaptor.getValue();
    clearInvocations(performanceStore, cardStateStore, taskScheduler, eventPublisher);
    when(performanceStore.findActiveByRoomId(ROOM_ID)).thenReturn(Optional.of(paused));
    when(cardStateStore.findRoomCard(ROOM_ID)).thenReturn(Optional.of(pending));

    countdownCaptor.getValue().run();

    ArgumentCaptor<CardAssignmentSnapshot> usedCaptor =
        ArgumentCaptor.forClass(CardAssignmentSnapshot.class);
    ArgumentCaptor<RoomCardSnapshot> activeCaptor = ArgumentCaptor.forClass(RoomCardSnapshot.class);
    verify(cardStateStore).saveAssignment(usedCaptor.capture());
    verify(cardStateStore).saveRoomCard(activeCaptor.capture());
    assertThat(usedCaptor.getValue().status()).isEqualTo(CardAssignmentStatus.USED);
    assertThat(activeCaptor.getValue().status()).isEqualTo(RoomCardStatus.ACTIVE);
    assertThat(activeCaptor.getValue().cardId()).isEqualTo(assignment.cardId());
    assertThat(activeCaptor.getValue().cardImageUrl()).isEqualTo(assignment.cardImageUrl());
    assertThat(activeCaptor.getValue().effectType()).isEqualTo(assignment.effectType());
    assertThat(activeCaptor.getValue().effectValue()).isEqualTo(assignment.effectValue());
    verify(performanceStore).save(any(PerformanceSnapShot.class));
    verify(eventPublisher)
        .publishToRoom(
            org.mockito.ArgumentMatchers.eq(ROOM_ID),
            org.mockito.ArgumentMatchers.eq(CardWebSocketEventType.CARD_EFFECT_STARTED),
            any());
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
            "https://cdn.test/cards/key-down-3.webp",
            CardEffectType.MR_KEY_CHANGE,
            CardEffectTargetType.PERFORMER,
            -3,
            15,
            0,
            60_000L,
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
}
