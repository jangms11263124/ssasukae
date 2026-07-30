package com.ssafy.ssasukae.domain.performance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.ssafy.ssasukae.domain.performance.redis.leaderboard.RoomLeaderboardEntry;
import com.ssafy.ssasukae.domain.performance.redis.leaderboard.RoomLeaderboardStore;
import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryDeadlineStore;
import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryProperties;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.rest.request.AiAnalysisFailureRequest;
import com.ssafy.ssasukae.domain.performance.rest.request.AiAnalysisSuccessRequest;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventType;
import com.ssafy.ssasukae.domain.performance.websocket.payload.LeaderboardItemPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.LeaderboardUpdatedPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceStateChangedPayload;
import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;
import com.ssafy.ssasukae.domain.performanceResult.repository.PerformanceResultRepository;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.performanceAnalysis.PerformanceAnalysisErrorCode;

@ExtendWith(MockitoExtension.class)
class PerformanceAnalysisServiceTest {

  private static final Long USER_ID = 1L;
  private static final Long ROOM_ID = 10L;
  private static final Long PARTICIPANT_ID = 100L;
  private static final Long SONG_ID = 20L;
  private static final Long PERFORMANCE_ID = 30L;

  private static final OffsetDateTime PREPARED_AT =
      OffsetDateTime.of(2026, 7, 28, 10, 0, 0, 0, ZoneOffset.ofHours(9));
  private static final OffsetDateTime STARTED_AT = PREPARED_AT.plusSeconds(3);
  private static final OffsetDateTime FINISHED_AT = STARTED_AT.plusMinutes(3);
  private static final Instant ANALYSIS_DEADLINE = FINISHED_AT.toInstant().plusSeconds(120);

  @Mock private RoomRepository roomRepository;
  @Mock private SongRepository songRepository;
  @Mock private UserRepository userRepository;
  @Mock private PerformanceStore performanceStore;
  @Mock private PerformanceRecoveryDeadlineStore recoveryDeadlineStore;
  @Mock private RoomLeaderboardStore roomLeaderboardStore;
  @Mock private PerformanceResultRepository performanceResultRepository;
  @Mock private PerformanceWebSocketEventPublisher eventPublisher;

  private PerformanceAnalysisService service;

  @BeforeEach
  void setUp() {
    service = createServiceAt(ANALYSIS_DEADLINE.minusSeconds(1));
  }

  private PerformanceAnalysisService createServiceAt(Instant currentTime) {
    return new PerformanceAnalysisService(
        roomRepository,
        songRepository,
        userRepository,
        performanceStore,
        new PerformanceRecoveryProperties(),
        Clock.fixed(currentTime, ZoneOffset.UTC),
        new PerformanceTransactionSupport(performanceStore, recoveryDeadlineStore),
        roomLeaderboardStore,
        performanceResultRepository,
        eventPublisher);
  }

  @AfterEach
  void clearTransactionSynchronization() {
    if (TransactionSynchronizationManager.isSynchronizationActive()) {
      TransactionSynchronizationManager.clearSynchronization();
    }
  }

  @Test
  @DisplayName("AI 최종 결과를 저장하고 리더보드를 갱신한 뒤 공연과 방을 종료한다")
  void completeAnalysisStoresResultAndFinishesPerformance() {
    Room room = playingRoom();
    User performer = user();
    Song song = song();
    PerformanceSnapShot analyzing = analyzingSnapshot();
    AiAnalysisSuccessRequest request = scoreRequest();

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(analyzing));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));
    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(performer));
    when(songRepository.findById(SONG_ID)).thenReturn(Optional.of(song));
    when(performanceResultRepository.save(any(PerformanceResult.class)))
        .thenAnswer(invocation -> invocation.getArgument(0));

    RoomLeaderboardEntry updated =
        new RoomLeaderboardEntry(
            PERFORMANCE_ID,
            PARTICIPANT_ID,
            performer.getNickname(),
            SONG_ID,
            song.getTitle(),
            request.finalScore());
    RoomLeaderboardEntry previous =
        new RoomLeaderboardEntry(29L, 99L, "이전 참가자", 19L, "이전 곡", 80);

    when(roomLeaderboardStore.saveAndGetRanked(ROOM_ID, updated))
        .thenReturn(List.of(updated, previous));

    beginTransaction();

    service.completeAnalysis(PERFORMANCE_ID, request);

    ArgumentCaptor<PerformanceResult> resultCaptor =
        ArgumentCaptor.forClass(PerformanceResult.class);
    verify(performanceResultRepository).save(resultCaptor.capture());

    PerformanceResult result = resultCaptor.getValue();
    assertThat(result.getSong()).isSameAs(song);
    assertThat(result.getUser()).isSameAs(performer);
    assertThat(result.getFinalScore()).isEqualTo(92);

    ArgumentCaptor<PerformanceSnapShot> snapshotCaptor =
        ArgumentCaptor.forClass(PerformanceSnapShot.class);
    verify(performanceStore).save(snapshotCaptor.capture());
    PerformanceSnapShot finished = snapshotCaptor.getValue();

    assertThat(finished.status()).isEqualTo(PerformanceStatus.FINISHED);
    assertThat(room.getStatus()).isEqualTo(RoomStatus.PREPARING);
    verify(performanceStore, never()).delete(any(PerformanceSnapShot.class));
    verifyNoInteractions(eventPublisher);

    commitTransaction();

    List<LeaderboardItemPayload> items =
        List.of(
            new LeaderboardItemPayload(
                1,
                PERFORMANCE_ID,
                PARTICIPANT_ID,
                performer.getNickname(),
                SONG_ID,
                song.getTitle(),
                92),
            new LeaderboardItemPayload(
                2, 29L, 99L, "이전 참가자", 19L, "이전 곡", 80));

    InOrder order = inOrder(performanceStore, eventPublisher);
    order.verify(performanceStore).delete(finished);
    order
        .verify(eventPublisher)
        .publish(
            ROOM_ID,
            PerformanceWebSocketEventType.LEADERBOARD_UPDATED,
            new LeaderboardUpdatedPayload(PERFORMANCE_ID, 92, items));
    order
        .verify(eventPublisher)
        .publish(
            ROOM_ID,
            PerformanceWebSocketEventType.PERFORMANCE_STATE_CHANGED,
            new PerformanceStateChangedPayload(
                PERFORMANCE_ID, PerformanceStatus.ANALYZING, PerformanceStatus.FINISHED));
  }

  @Test
  @DisplayName("점수 범위를 벗어난 최종 결과를 거부한다")
  void completeAnalysisRejectsInvalidScore() {
    AiAnalysisSuccessRequest invalidRequest =
        new AiAnalysisSuccessRequest(
            101,
            91,
            94,
            null,
            92);

    assertAnalysisError(
        PerformanceAnalysisErrorCode.INVALID_SCORE_RANGE,
        () -> service.completeAnalysis(PERFORMANCE_ID, invalidRequest));

    verifyNoInteractions(
        roomRepository,
        songRepository,
        userRepository,
        performanceStore,
        roomLeaderboardStore,
        performanceResultRepository,
        eventPublisher);
  }

  @Test
  @DisplayName("AI 분석 실패 시 결과와 리더보드 없이 방을 PREPARING으로 복구한다")
  void failAnalysisRestoresRoomWithoutResult() {
    Room room = playingRoom();
    PerformanceSnapShot analyzing = analyzingSnapshot();
    AiAnalysisFailureRequest request = new AiAnalysisFailureRequest("분석 서버 처리 실패");

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(analyzing));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    beginTransaction();

    service.failAnalysis(PERFORMANCE_ID, request);

    ArgumentCaptor<PerformanceSnapShot> snapshotCaptor =
        ArgumentCaptor.forClass(PerformanceSnapShot.class);
    verify(performanceStore).save(snapshotCaptor.capture());
    PerformanceSnapShot failed = snapshotCaptor.getValue();

    assertThat(failed.status()).isEqualTo(PerformanceStatus.ANALYSIS_FAILED);
    assertThat(room.getStatus()).isEqualTo(RoomStatus.PREPARING);
    verifyNoInteractions(performanceResultRepository, roomLeaderboardStore);
    verifyNoInteractions(eventPublisher);

    commitTransaction();

    InOrder order = inOrder(performanceStore, eventPublisher);
    order.verify(performanceStore).delete(failed);
    order
        .verify(eventPublisher)
        .publish(
            ROOM_ID,
            PerformanceWebSocketEventType.PERFORMANCE_STATE_CHANGED,
            new PerformanceStateChangedPayload(
                PERFORMANCE_ID, PerformanceStatus.ANALYZING, PerformanceStatus.ANALYSIS_FAILED));
  }

  @Test
  @DisplayName("분석 마감 시각에 도착한 AI 성공 결과는 반영하지 않는다")
  void completeAnalysisRejectsResultAtDeadline() {
    Room room = playingRoom();
    PerformanceSnapShot analyzing = analyzingSnapshot();
    service = createServiceAt(ANALYSIS_DEADLINE);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(analyzing));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    assertAnalysisError(
        PerformanceAnalysisErrorCode.ANALYSIS_DEADLINE_EXPIRED,
        () -> service.completeAnalysis(PERFORMANCE_ID, scoreRequest()));

    assertThat(room.getStatus()).isEqualTo(RoomStatus.PLAYING);
    verify(performanceStore, never()).save(any(PerformanceSnapShot.class));
    verifyNoInteractions(
        userRepository,
        songRepository,
        performanceResultRepository,
        roomLeaderboardStore,
        eventPublisher);
  }

  @Test
  @DisplayName("분석 마감 시각 이후 도착한 AI 실패 결과는 반영하지 않는다")
  void failAnalysisRejectsResultAfterDeadline() {
    Room room = playingRoom();
    PerformanceSnapShot analyzing = analyzingSnapshot();
    service = createServiceAt(ANALYSIS_DEADLINE.plusSeconds(1));

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(analyzing));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    assertAnalysisError(
        PerformanceAnalysisErrorCode.ANALYSIS_DEADLINE_EXPIRED,
        () ->
            service.failAnalysis(
                PERFORMANCE_ID, new AiAnalysisFailureRequest("분석 서버 처리 실패")));

    assertThat(room.getStatus()).isEqualTo(RoomStatus.PLAYING);
    verify(performanceStore, never()).save(any(PerformanceSnapShot.class));
    verifyNoInteractions(
        performanceResultRepository,
        roomLeaderboardStore,
        eventPublisher);
  }

  @Test
  @DisplayName("DB 트랜잭션이 롤백되면 리더보드와 공연 스냅샷을 복구한다")
  void completeAnalysisRestoresRedisOnRollback() {
    Room room = playingRoom();
    User performer = user();
    Song song = song();
    PerformanceSnapShot analyzing = analyzingSnapshot();
    AiAnalysisSuccessRequest request = scoreRequest();

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(analyzing));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));
    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(performer));
    when(songRepository.findById(SONG_ID)).thenReturn(Optional.of(song));
    when(performanceResultRepository.save(any(PerformanceResult.class)))
        .thenAnswer(invocation -> invocation.getArgument(0));
    when(roomLeaderboardStore.saveAndGetRanked(eq(ROOM_ID), any(RoomLeaderboardEntry.class)))
        .thenAnswer(
            invocation -> {
              RoomLeaderboardEntry entry = invocation.getArgument(1, RoomLeaderboardEntry.class);
              return List.of(entry);
            });

    beginTransaction();

    service.completeAnalysis(PERFORMANCE_ID, request);
    rollbackTransaction();

    verify(roomLeaderboardStore).delete(ROOM_ID, PERFORMANCE_ID);
    verify(performanceStore).save(analyzing);
    verifyNoInteractions(eventPublisher);
  }

  @Test
  @DisplayName("ANALYZING 상태가 아닌 공연의 최종 결과는 거부한다")
  void completeAnalysisRejectsInvalidPerformanceState() {
    Room room = playingRoom();
    PerformanceSnapShot playing =
        PerformanceSnapShot.prepare(
                PERFORMANCE_ID, ROOM_ID, PARTICIPANT_ID, USER_ID, SONG_ID, PREPARED_AT)
            .startPlayback(STARTED_AT);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(playing));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    assertThatThrownBy(() -> service.completeAnalysis(PERFORMANCE_ID, scoreRequest()))
        .isInstanceOfSatisfying(
            CustomException.class,
            exception ->
                assertThat(exception.getErrorCode())
                    .isEqualTo(PerformanceAnalysisErrorCode.INVALID_PERFORMANCE_STATE));

    verifyNoInteractions(
        userRepository,
        songRepository,
        performanceResultRepository,
        roomLeaderboardStore,
        eventPublisher);
  }

  private AiAnalysisSuccessRequest scoreRequest() {
    return new AiAnalysisSuccessRequest(
        90,
        91,
        94,
        88,
        92);
  }

  private void assertAnalysisError(
      PerformanceAnalysisErrorCode expectedErrorCode, Runnable action) {
    assertThatThrownBy(action::run)
        .isInstanceOfSatisfying(
            CustomException.class,
            exception -> assertThat(exception.getErrorCode()).isEqualTo(expectedErrorCode));
  }

  private PerformanceSnapShot analyzingSnapshot() {
    return PerformanceSnapShot.prepare(
            PERFORMANCE_ID, ROOM_ID, PARTICIPANT_ID, USER_ID, SONG_ID, PREPARED_AT)
        .startPlayback(STARTED_AT)
        .finishPlayback(FINISHED_AT);
  }

  private Room playingRoom() {
    Room room =
        Room.create(
            "ABC123",
            "테스트 방",
            RoomMode.GENERAL,
            user(),
            "openvidu-session",
            LocalDateTime.of(2026, 7, 28, 9, 0));
    ReflectionTestUtils.setField(room, "id", ROOM_ID);
    room.startPerformance();
    return room;
  }

  private Song song() {
    Song song =
        Song.create("테스트 곡", "테스트 가수", 180, 3, "cover.jpg", "mr.mp3", "midi.json", "lyrics.json");
    ReflectionTestUtils.setField(song, "id", SONG_ID);
    return song;
  }

  private User user() {
    User user =
        User.builder()
            .email("user@test.com")
            .nickname("테스트 사용자")
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

  private void rollbackTransaction() {
    List<TransactionSynchronization> synchronizations =
        TransactionSynchronizationManager.getSynchronizations();
    synchronizations.forEach(TransactionSynchronization::beforeCompletion);
    synchronizations.forEach(
        synchronization ->
            synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
    TransactionSynchronizationManager.clearSynchronization();
  }
}
