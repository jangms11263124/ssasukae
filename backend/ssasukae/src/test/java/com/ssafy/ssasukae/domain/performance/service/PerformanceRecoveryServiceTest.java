package com.ssafy.ssasukae.domain.performance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.ssafy.ssasukae.domain.card.service.CardService;
import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryDeadlineStore;
import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryProperties;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventType;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceStateChangedPayload;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;

@ExtendWith(MockitoExtension.class)
class PerformanceRecoveryServiceTest {

  private static final Long USER_ID = 1L;
  private static final Long ROOM_ID = 10L;
  private static final Long PARTICIPANT_ID = 100L;
  private static final Long SONG_ID = 20L;
  private static final Long PERFORMANCE_ID = 30L;

  private static final OffsetDateTime PREPARED_AT =
      OffsetDateTime.of(2026, 7, 29, 10, 0, 0, 0, ZoneOffset.ofHours(9));
  private static final OffsetDateTime STARTED_AT = PREPARED_AT.plusSeconds(3);
  private static final OffsetDateTime PLAYBACK_FINISHED_AT = STARTED_AT.plusMinutes(3);

  @Mock private RoomRepository roomRepository;
  @Mock private RoomParticipantRepository roomParticipantRepository;
  @Mock private PerformanceStore performanceStore;
  @Mock private PerformanceRecoveryDeadlineStore deadlineStore;
  @Mock private PerformanceWebSocketEventPublisher eventPublisher;
  @Mock private CardService cardService;

  private PerformanceRecoveryProperties properties;
  private PerformanceRecoveryService service;

  @BeforeEach
  void setUp() {
    properties = new PerformanceRecoveryProperties();
    PerformanceTransactionSupport transactionSupport =
        new PerformanceTransactionSupport(performanceStore, deadlineStore);
    PerformanceCancellationProcessor cancellationProcessor =
        new PerformanceCancellationProcessor(transactionSupport, eventPublisher, cardService, roomParticipantRepository);
    org.mockito.Mockito.lenient()
        .when(
            cardService.closeForPerformance(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
        .thenAnswer(invocation -> invocation.getArgument(0));

    service =
        new PerformanceRecoveryService(
            roomRepository,
            performanceStore,
            deadlineStore,
            properties,
            transactionSupport,
            cancellationProcessor,
            eventPublisher);
  }

  @AfterEach
  void clearTransactionSynchronization() {
    if (TransactionSynchronizationManager.isSynchronizationActive()) {
      TransactionSynchronizationManager.clearSynchronization();
    }
  }

  @Test
  @DisplayName("AI 분석 제한 시간이 지나면 결과와 리더보드 없이 분석 실패로 종료한다")
  void recoverExpiredFailsAnalysisAfterTimeout() {
    Room room = playingRoom();
    PerformanceSnapShot analyzing = analyzingSnapshot();
    Instant expiredAt = PLAYBACK_FINISHED_AT.toInstant().plus(properties.getAnalysisTimeout());

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(analyzing));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    beginTransaction();

    service.recoverExpired(PERFORMANCE_ID, expiredAt);

    assertThat(room.getStatus()).isEqualTo(RoomStatus.PREPARING);
    verify(performanceStore, never()).save(org.mockito.ArgumentMatchers.any());
    verifyNoInteractions(eventPublisher);

    commitTransaction();

    verify(deadlineStore).delete(PERFORMANCE_ID);
    verify(performanceStore).delete(analyzing);
    verify(eventPublisher)
        .publish(
            ROOM_ID,
            PerformanceWebSocketEventType.PERFORMANCE_STATE_CHANGED,
            new PerformanceStateChangedPayload(
                PERFORMANCE_ID, PerformanceStatus.ANALYZING, PerformanceStatus.ANALYSIS_FAILED));
  }

  @Test
  @DisplayName("복구 대상으로 들어온 ANALYZING 공연은 재예약 없이 분석 실패로 종료한다")
  void recoverExpiredFailsAnalyzingPerformanceWithoutRescheduling() {
    Room room = playingRoom();
    PerformanceSnapShot analyzing = analyzingSnapshot();
    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(analyzing));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    beginTransaction();

    service.recoverExpired(PERFORMANCE_ID, PLAYBACK_FINISHED_AT.toInstant().plusSeconds(10));

    verify(performanceStore, never()).save(org.mockito.ArgumentMatchers.any());
    assertThat(room.getStatus()).isEqualTo(RoomStatus.PREPARING);
    verifyNoInteractions(eventPublisher);

    commitTransaction();

    verify(deadlineStore).delete(PERFORMANCE_ID);
    verify(performanceStore).delete(analyzing);
    verify(eventPublisher)
        .publish(
            ROOM_ID,
            PerformanceWebSocketEventType.PERFORMANCE_STATE_CHANGED,
            new PerformanceStateChangedPayload(
                PERFORMANCE_ID, PerformanceStatus.ANALYZING, PerformanceStatus.ANALYSIS_FAILED));
  }

  @Test
  @DisplayName("가창자 재개 준비 제한시간이 지나면 중단된 공연을 취소한다")
  void recoverExpiredCancelsSuspendedPerformance() {
    Room room = playingRoom();
    PerformanceSnapShot suspended =
        playingSnapshot().suspendForPerformerDisconnect(STARTED_AT.plusSeconds(30));
    when(performanceStore.findByPerformanceId(PERFORMANCE_ID))
        .thenReturn(Optional.of(suspended));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    beginTransaction();
    service.recoverExpired(PERFORMANCE_ID, suspended.suspendedAt().toInstant().plusSeconds(15));

    assertThat(room.getStatus()).isEqualTo(RoomStatus.PREPARING);
    commitTransaction();

    verify(performanceStore).delete(suspended);
    verify(deadlineStore).delete(PERFORMANCE_ID);
  }

  @Test
  @DisplayName("이미 정리된 공연의 중복 복구 요청은 마감 정보만 제거한다")
  void recoverExpiredIsIdempotentWhenPerformanceAlreadyRemoved() {
    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.empty());

    service.recoverExpired(PERFORMANCE_ID, Instant.now());

    verify(deadlineStore).delete(PERFORMANCE_ID);
    verifyNoInteractions(roomRepository, eventPublisher);
  }

  @Test
  @DisplayName("가창자가 재생 중 명시적으로 방을 나가면 유예 없이 공연을 취소한다")
  void recoverPerformerExitCaseCancelsPlayingPerformanceImmediately() {
    Room room = playingRoom();
    PerformanceSnapShot playing = playingSnapshot();

    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));
    when(performanceStore.findActiveByRoomId(ROOM_ID)).thenReturn(Optional.of(playing));

    beginTransaction();

    service.recoverPerformerExitCase(ROOM_ID, USER_ID);

    verify(performanceStore, never()).save(org.mockito.ArgumentMatchers.any());
    assertThat(room.getStatus()).isEqualTo(RoomStatus.PREPARING);

    commitTransaction();

    verify(deadlineStore).delete(PERFORMANCE_ID);
    verify(performanceStore).delete(playing);
  }

  private PerformanceSnapShot playingSnapshot() {
    return PerformanceSnapShot.prepare(
            PERFORMANCE_ID, ROOM_ID, PARTICIPANT_ID, USER_ID, SONG_ID, PREPARED_AT)
        .startPlayback(STARTED_AT);
  }

  private PerformanceSnapShot analyzingSnapshot() {
    return playingSnapshot().finishPlayback(PLAYBACK_FINISHED_AT);
  }

  private Room playingRoom() {
    Room room =
        Room.create(
            "ABC123",
            "복구 테스트 방",
            RoomMode.GENERAL,
            user(),
            "openvidu-session",
            LocalDateTime.of(2026, 7, 29, 9, 0));
    ReflectionTestUtils.setField(room, "id", ROOM_ID);
    room.startPerformance();
    return room;
  }

  private User user() {
    User user =
        User.builder()
            .email("user@test.com")
            .nickname("가창자")
            .provider(OAuthProvider.GOOGLE)
            .providerId("provider-user")
            .role(Role.USER)
            .build();
    ReflectionTestUtils.setField(user, "id", USER_ID);
    return user;
  }

  private void beginTransaction() {
    TransactionSynchronizationManager.initSynchronization();
  }

  private void commitTransaction() {
    List<TransactionSynchronization> synchronizations =
        TransactionSynchronizationManager.getSynchronizations();
    synchronizations.forEach(synchronization -> synchronization.beforeCommit(false));
    synchronizations.forEach(TransactionSynchronization::beforeCompletion);
    synchronizations.forEach(TransactionSynchronization::afterCommit);
    synchronizations.forEach(
        synchronization ->
            synchronization.afterCompletion(TransactionSynchronization.STATUS_COMMITTED));
    TransactionSynchronizationManager.clearSynchronization();
  }
}
