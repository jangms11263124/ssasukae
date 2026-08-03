package com.ssafy.ssasukae.domain.performance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.lenient;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.ssafy.ssasukae.domain.card.service.CardService;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectEndReason;
import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryDeadlineStore;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventType;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;

@ExtendWith(MockitoExtension.class)
class PerformanceConnectionRecoveryServiceTest {

  @Mock private RoomRepository roomRepository;
  @Mock private RoomParticipantRepository participantRepository;
  @Mock private PerformanceStore performanceStore;
  @Mock private PerformanceRecoveryDeadlineStore deadlineStore;
  @Mock private PerformanceWebSocketEventPublisher eventPublisher;
  @Mock private CardService cardService;

  private PerformanceConnectionRecoveryService service;
  private Room room;
  private RoomParticipant performer;
  private PerformanceSnapShot playing;

  @BeforeEach
  void setUp() {
    lenient().when(performanceStore.replace(any(), any())).thenReturn(true);
    PerformanceTransactionSupport transactionSupport =
        new PerformanceTransactionSupport(performanceStore, deadlineStore);
    service =
        new PerformanceConnectionRecoveryService(
            roomRepository,
            participantRepository,
            performanceStore,
            transactionSupport,
            eventPublisher,
            cardService);

    User user =
        User.builder()
            .email("performer@test.com")
            .nickname("performer")
            .provider(OAuthProvider.GOOGLE)
            .providerId("performer")
            .role(Role.USER)
            .build();
    ReflectionTestUtils.setField(user, "id", 1L);
    room = Room.create("ABC123", "room", RoomMode.GENERAL, user, "session", LocalDateTime.now());
    ReflectionTestUtils.setField(room, "id", 10L);
    room.startPerformance();
    performer = RoomParticipant.join(room, user, LocalDateTime.now());
    ReflectionTestUtils.setField(performer, "id", 100L);
    performer.connect("connection-1");
    performer.promoteToPerformer();
    playing =
        PerformanceSnapShot.prepare(
                30L,
                10L,
                100L,
                1L,
                20L,
                180_000L,
                OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(10))
            .startPlayback(OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(8));
  }

  @Test
  void performerDisconnectSuspendsPerformance() {
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(performanceStore.findActiveByRoomId(10L)).thenReturn(Optional.of(playing));
    when(cardService.suspendForPerformance(playing, CardEffectEndReason.PERFORMER_DISCONNECTED))
        .thenReturn(playing);

    service.suspendForPerformerDisconnect(performer);

    ArgumentCaptor<PerformanceSnapShot> captor = ArgumentCaptor.forClass(PerformanceSnapShot.class);
    verify(performanceStore).replace(any(), captor.capture());
    assertThat(captor.getValue().status()).isEqualTo(PerformanceStatus.SUSPENDED);
    verify(eventPublisher)
        .publish(eq(10L), eq(PerformanceWebSocketEventType.PERFORMANCE_SUSPENDED), any());
    verifyNoInteractions(deadlineStore);
  }

  @Test
  void readyFromReconnectedPerformerResumesPerformance() {
    PerformanceSnapShot suspended =
        playing.suspendForPerformerDisconnect(OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(1));
    when(roomRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
    when(participantRepository.findByRoomIdAndUserId(10L, 1L))
        .thenReturn(Optional.of(performer));
    when(performanceStore.findByPerformanceId(30L)).thenReturn(Optional.of(suspended));

    service.resumeAfterPerformerReady(1L, 10L, 30L);

    ArgumentCaptor<PerformanceSnapShot> captor = ArgumentCaptor.forClass(PerformanceSnapShot.class);
    verify(performanceStore).replace(any(), captor.capture());
    assertThat(captor.getValue().status()).isEqualTo(PerformanceStatus.PLAYING);
    verify(eventPublisher)
        .publish(eq(10L), eq(PerformanceWebSocketEventType.PERFORMANCE_RESUMED), any());
    verifyNoInteractions(deadlineStore);
  }
}
