package com.ssafy.ssasukae.domain.performanceResult.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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

import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryDeadlineStore;
import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryProperties;
import com.ssafy.ssasukae.domain.performance.redis.leaderboard.RoomLeaderboardEntry;
import com.ssafy.ssasukae.domain.performance.redis.leaderboard.RoomLeaderboardStore;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.service.PerformanceTransactionSupport;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventType;
import com.ssafy.ssasukae.domain.performance.websocket.payload.LeaderboardItemPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.LeaderboardUpdatedPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceStateChangedPayload;
import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultRequestDTO;
import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultResponseDTO;
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
class PerformanceResultServiceTest {

  private static final Long USER_ID = 1L;
  private static final Long ROOM_ID = 10L;
  private static final Long PARTICIPANT_ID = 100L;
  private static final Long SONG_ID = 20L;
  private static final Long PERFORMANCE_ID = 30L;
  private static final Long RESULT_ID = 40L;

  private static final OffsetDateTime PREPARED_AT =
      OffsetDateTime.of(2026, 7, 28, 10, 0, 0, 0, ZoneOffset.ofHours(9));
  private static final OffsetDateTime STARTED_AT = PREPARED_AT.plusSeconds(3);
  private static final OffsetDateTime FINISHED_AT = STARTED_AT.plusMinutes(3);
  private static final Instant ANALYSIS_DEADLINE = FINISHED_AT.toInstant().plusSeconds(120);

  @Mock private UserRepository userRepository;
  @Mock private SongRepository songRepository;
  @Mock private PerformanceResultRepository performanceResultRepository;
  @Mock private RoomRepository roomRepository;
  @Mock private PerformanceStore performanceStore;
  @Mock private RoomLeaderboardStore roomLeaderboardStore;
  @Mock private PerformanceRecoveryDeadlineStore recoveryDeadlineStore;
  @Mock private PerformanceWebSocketEventPublisher eventPublisher;

  private PerformanceResultService service;

  @BeforeEach
  void setUp() {
    service = createServiceAt(ANALYSIS_DEADLINE.minusSeconds(1));
  }

  private PerformanceResultService createServiceAt(Instant currentTime) {
    return new PerformanceResultService(
        userRepository,
        songRepository,
        performanceResultRepository,
        roomRepository,
        performanceStore,
        roomLeaderboardStore,
        new PerformanceRecoveryProperties(),
        Clock.fixed(currentTime, ZoneOffset.UTC),
        new PerformanceTransactionSupport(performanceStore, recoveryDeadlineStore),
        eventPublisher);
  }

  @AfterEach
  void clearTransactionSynchronization() {
    if (TransactionSynchronizationManager.isSynchronizationActive()) {
      TransactionSynchronizationManager.clearSynchronization();
    }
  }

  @Test
  @DisplayName("결과 저장과 리더보드 갱신 후 공연을 종료하고 이벤트를 발행한다")
  void getScoreFinishesPerformanceAndPublishesEventsAfterCommit() {
    Room room = playingRoom();
    PerformanceSnapShot analyzing = analyzingSnapshot();
    PerformanceResultRequestDTO.ScoreDTO request = scoreRequest();
    User user = user();
    Song song = song();
    PerformanceResult saved = savedResult(user, song);
    RoomLeaderboardEntry updated =
        new RoomLeaderboardEntry(
            PERFORMANCE_ID,
            PARTICIPANT_ID,
            user.getNickname(),
            SONG_ID,
            song.getTitle(),
            request.getFinalScore());
    RoomLeaderboardEntry previous = new RoomLeaderboardEntry(29L, 99L, "이전 참가자", 19L, "이전 곡", 80);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(analyzing));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));
    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
    when(songRepository.findById(SONG_ID)).thenReturn(Optional.of(song));
    when(performanceResultRepository.save(any(PerformanceResult.class))).thenReturn(saved);
    when(roomLeaderboardStore.find(ROOM_ID, PERFORMANCE_ID)).thenReturn(Optional.empty());
    when(roomLeaderboardStore.saveAndGetRanked(ROOM_ID, updated))
        .thenReturn(List.of(updated, previous));

    beginTransaction();

    PerformanceResultResponseDTO.PerformanceIdDTO response =
        service.getScore(PERFORMANCE_ID, request);

    assertThat(response.getPerformanceId()).isEqualTo(RESULT_ID);
    assertThat(room.getStatus()).isEqualTo(RoomStatus.PREPARING);

    ArgumentCaptor<PerformanceResult> resultCaptor =
        ArgumentCaptor.forClass(PerformanceResult.class);
    verify(performanceResultRepository).save(resultCaptor.capture());
    assertThat(resultCaptor.getValue().getFinalScore()).isEqualTo(92);

    ArgumentCaptor<PerformanceSnapShot> snapshotCaptor =
        ArgumentCaptor.forClass(PerformanceSnapShot.class);
    verify(performanceStore).save(snapshotCaptor.capture());
    PerformanceSnapShot finished = snapshotCaptor.getValue();
    assertThat(finished.status()).isEqualTo(PerformanceStatus.FINISHED);
    verifyNoInteractions(eventPublisher);

    commitTransaction();

    List<LeaderboardItemPayload> items =
        List.of(
            new LeaderboardItemPayload(
                1,
                PERFORMANCE_ID,
                PARTICIPANT_ID,
                user.getNickname(),
                SONG_ID,
                song.getTitle(),
                92),
            new LeaderboardItemPayload(2, 29L, 99L, "이전 참가자", 19L, "이전 곡", 80));
    InOrder order = inOrder(performanceStore, recoveryDeadlineStore, eventPublisher);
    order.verify(performanceStore).delete(finished);
    order.verify(recoveryDeadlineStore).delete(PERFORMANCE_ID);
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
  @DisplayName("요청 사용자나 곡이 공연 정보와 다르면 결과를 반영하지 않는다")
  void getScoreRejectsMismatchedPerformanceContext() {
    Room room = playingRoom();
    PerformanceSnapShot analyzing = analyzingSnapshot();
    PerformanceResultRequestDTO.ScoreDTO request =
        PerformanceResultRequestDTO.ScoreDTO.builder()
            .userId(999L)
            .songId(SONG_ID)
            .pitchScore(90)
            .rhythmScore(91)
            .lyricsScore(94)
            .stabilityScore(88)
            .finalScore(92)
            .build();

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(analyzing));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    assertThatThrownBy(() -> service.getScore(PERFORMANCE_ID, request))
        .isInstanceOfSatisfying(
            CustomException.class,
            exception ->
                assertThat(exception.getErrorCode())
                    .isEqualTo(PerformanceAnalysisErrorCode.INVALID_REQUEST));

    verifyNoInteractions(
        userRepository,
        songRepository,
        performanceResultRepository,
        roomLeaderboardStore,
        eventPublisher);
  }

  @Test
  @DisplayName("분석 마감 시각 이후 도착한 결과를 반영하지 않는다")
  void getScoreRejectsResultAtDeadline() {
    Room room = playingRoom();
    PerformanceSnapShot analyzing = analyzingSnapshot();
    service = createServiceAt(ANALYSIS_DEADLINE);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(analyzing));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    assertThatThrownBy(() -> service.getScore(PERFORMANCE_ID, scoreRequest()))
        .isInstanceOfSatisfying(
            CustomException.class,
            exception ->
                assertThat(exception.getErrorCode())
                    .isEqualTo(PerformanceAnalysisErrorCode.ANALYSIS_DEADLINE_EXPIRED));

    assertThat(room.getStatus()).isEqualTo(RoomStatus.PLAYING);
    verifyNoInteractions(
        userRepository,
        songRepository,
        performanceResultRepository,
        roomLeaderboardStore,
        eventPublisher);
  }

  @Test
  @DisplayName("트랜잭션 롤백 시 리더보드와 공연 스냅샷을 복구한다")
  void getScoreRestoresRedisStateOnRollback() {
    Room room = playingRoom();
    PerformanceSnapShot analyzing = analyzingSnapshot();
    PerformanceResultRequestDTO.ScoreDTO request = scoreRequest();
    User user = user();
    Song song = song();
    PerformanceResult saved = savedResult(user, song);
    RoomLeaderboardEntry previous =
        new RoomLeaderboardEntry(
            PERFORMANCE_ID, PARTICIPANT_ID, user.getNickname(), SONG_ID, song.getTitle(), 70);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(analyzing));
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));
    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
    when(songRepository.findById(SONG_ID)).thenReturn(Optional.of(song));
    when(performanceResultRepository.save(any(PerformanceResult.class))).thenReturn(saved);
    when(roomLeaderboardStore.find(ROOM_ID, PERFORMANCE_ID)).thenReturn(Optional.of(previous));
    when(roomLeaderboardStore.saveAndGetRanked(ROOM_ID, previous)).thenReturn(List.of(previous));
    when(roomLeaderboardStore.saveAndGetRanked(
            org.mockito.ArgumentMatchers.eq(ROOM_ID),
            org.mockito.ArgumentMatchers.argThat(entry -> entry.finalScore() == 92)))
        .thenReturn(List.of());

    beginTransaction();

    service.getScore(PERFORMANCE_ID, request);
    rollbackTransaction();

    InOrder order = inOrder(roomLeaderboardStore);
    order
        .verify(roomLeaderboardStore)
        .saveAndGetRanked(
            org.mockito.ArgumentMatchers.eq(ROOM_ID),
            org.mockito.ArgumentMatchers.argThat(entry -> entry.finalScore() == 92));
    order.verify(roomLeaderboardStore).saveAndGetRanked(ROOM_ID, previous);
    verify(roomLeaderboardStore, never()).delete(ROOM_ID, PERFORMANCE_ID);
    verify(performanceStore).save(analyzing);
    verifyNoInteractions(eventPublisher);
  }

  private PerformanceResultRequestDTO.ScoreDTO scoreRequest() {
    return PerformanceResultRequestDTO.ScoreDTO.builder()
        .userId(USER_ID)
        .songId(SONG_ID)
        .pitchScore(90)
        .rhythmScore(91)
        .lyricsScore(94)
        .stabilityScore(88)
        .finalScore(92)
        .overall("전체 평가")
        .strength("강점")
        .weakness("약점")
        .tips("팁")
        .build();
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

  private PerformanceResult savedResult(User user, Song song) {
    PerformanceResult result =
        PerformanceResult.builder()
            .user(user)
            .song(song)
            .pitchScore(90)
            .rhythmScore(91)
            .lyricsScore(94)
            .stabilityScore(88)
            .finalScore(92)
            .build();
    ReflectionTestUtils.setField(result, "id", RESULT_ID);
    return result;
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
