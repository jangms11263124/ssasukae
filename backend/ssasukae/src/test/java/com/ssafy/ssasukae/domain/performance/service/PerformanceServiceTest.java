package com.ssafy.ssasukae.domain.performance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

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

import com.ssafy.ssasukae.domain.card.service.CardService;
import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryDeadlineStore;
import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryProperties;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSettings;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.type.PerformanceCancelReason;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventType;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceCancelledPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformancePreparationStartedPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceSettingsChangedPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceSettingsPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceStartedPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PlaybackFinishedPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PlaybackStartedPayload;
import com.ssafy.ssasukae.domain.performance.websocket.request.PerformancePrepareRequest;
import com.ssafy.ssasukae.domain.performance.websocket.request.PerformanceSettingsChangeRequest;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketBusinessException;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketErrorCode;
import com.ssafy.ssasukae.integration.aws.S3StorageService;

@ExtendWith(MockitoExtension.class)
class PerformanceServiceTest {

  private static final Long USER_ID = 1L;
  private static final Long OTHER_USER_ID = 2L;

  private static final Long ROOM_ID = 10L;
  private static final Long OTHER_ROOM_ID = 11L;

  private static final Long PARTICIPANT_ID = 100L;
  private static final Long OTHER_PARTICIPANT_ID = 200L;

  private static final Long SONG_ID = 20L;
  private static final Long PERFORMANCE_ID = 30L;

  private static final OffsetDateTime PREPARED_AT =
      OffsetDateTime.of(2026, 7, 28, 10, 0, 0, 0, ZoneOffset.ofHours(9));

  private static final OffsetDateTime STARTED_AT = PREPARED_AT.plusSeconds(3);

  @Mock private RoomRepository roomRepository;

  @Mock private RoomParticipantRepository roomParticipantRepository;

  @Mock private SongRepository songRepository;

  @Mock private PerformanceStore performanceStore;

  @Mock private PerformanceRecoveryDeadlineStore recoveryDeadlineStore;

  @Mock private S3StorageService s3StorageService;

  @Mock private PerformanceWebSocketEventPublisher eventPublisher;

  @Mock private CardService cardService;

  private PerformanceService performanceService;

  @BeforeEach
  void setUp() {
    PerformanceTransactionSupport transactionSupport =
        new PerformanceTransactionSupport(performanceStore, recoveryDeadlineStore);
    PerformanceCancellationProcessor cancellationProcessor =
        new PerformanceCancellationProcessor(transactionSupport, eventPublisher, cardService);
    org.mockito.Mockito.lenient()
        .when(cardService.closeForPerformance(any(), any()))
        .thenAnswer(invocation -> invocation.getArgument(0));

    performanceService =
        new PerformanceService(
            roomRepository,
            roomParticipantRepository,
            songRepository,
            performanceStore,
            recoveryDeadlineStore,
            new PerformanceRecoveryProperties(),
            transactionSupport,
            cancellationProcessor,
            s3StorageService,
            eventPublisher,
            cardService);
  }

  @AfterEach
  void clearTransactionSynchronization() {
    if (TransactionSynchronizationManager.isSynchronizationActive()) {
      TransactionSynchronizationManager.clearSynchronization();
    }
  }

  /*
   * 공연 준비
   */

  @Test
  @DisplayName("공연 준비는 Redis 세션을 생성하고 커밋 후 시작 이벤트 두 개를 순서대로 발행한다")
  void prepareCreatesSessionAndPublishesEventsAfterCommit() {
    Room room = preparingRoom();
    RoomParticipant performer = performer(room);
    Song song = songWithResources();

    stubPrepareContext(room, performer, song);

    when(performanceStore.nextPerformanceId()).thenReturn(PERFORMANCE_ID);

    when(performanceStore.create(any(PerformanceSnapShot.class))).thenReturn(true);

    when(s3StorageService.presignedUrl("songs/20/mr.mp3")).thenReturn("https://cdn.test/mr");

    when(s3StorageService.presignedUrl("songs/20/midi.json")).thenReturn("https://cdn.test/midi");

    beginTransaction();

    performanceService.prepare(USER_ID, ROOM_ID, new PerformancePrepareRequest(SONG_ID));

    ArgumentCaptor<PerformanceSnapShot> sessionCaptor =
        ArgumentCaptor.forClass(PerformanceSnapShot.class);

    verify(performanceStore).create(sessionCaptor.capture());

    PerformanceSnapShot created = sessionCaptor.getValue();

    assertThat(created)
        .extracting(
            PerformanceSnapShot::performanceId,
            PerformanceSnapShot::roomId,
            PerformanceSnapShot::performerParticipantId,
            PerformanceSnapShot::performerUserId,
            PerformanceSnapShot::songId,
            PerformanceSnapShot::status,
            PerformanceSnapShot::settings)
        .containsExactly(
            PERFORMANCE_ID,
            ROOM_ID,
            PARTICIPANT_ID,
            USER_ID,
            SONG_ID,
            PerformanceStatus.PREPARING,
            PerformanceSettings.defaults());

    assertThat(room.getStatus()).isEqualTo(RoomStatus.PLAYING);

    verifyNoInteractions(eventPublisher);

    commitTransaction();

    InOrder eventOrder = inOrder(eventPublisher);

    eventOrder
        .verify(eventPublisher)
        .publish(
            ROOM_ID,
            PerformanceWebSocketEventType.PERFORMANCE_STARTED,
            new PerformanceStartedPayload(
                PERFORMANCE_ID,
                PARTICIPANT_ID,
                SONG_ID,
                PerformanceStatus.PREPARING,
                RoomStatus.PLAYING));

    eventOrder
        .verify(eventPublisher)
        .publish(
            ROOM_ID,
            PerformanceWebSocketEventType.PERFORMANCE_PREPARATION_STARTED,
            new PerformancePreparationStartedPayload(
                PERFORMANCE_ID,
                PARTICIPANT_ID,
                SONG_ID,
                "테스트 곡",
                "https://cdn.test/mr",
                "https://cdn.test/midi"));
  }

  @Test
  @DisplayName("공연 준비 트랜잭션이 롤백되면 생성한 Redis 세션을 삭제하고 이벤트를 발행하지 않는다")
  void prepareDeletesCreatedSessionOnRollback() {
    Room room = preparingRoom();

    stubPrepareContext(room, performer(room), songWithResources());

    when(performanceStore.nextPerformanceId()).thenReturn(PERFORMANCE_ID);

    when(performanceStore.create(any(PerformanceSnapShot.class))).thenReturn(true);

    when(s3StorageService.presignedUrl("songs/20/mr.mp3")).thenReturn("https://cdn.test/mr");

    when(s3StorageService.presignedUrl("songs/20/midi.json")).thenReturn("https://cdn.test/midi");

    beginTransaction();

    performanceService.prepare(USER_ID, ROOM_ID, new PerformancePrepareRequest(SONG_ID));

    ArgumentCaptor<PerformanceSnapShot> sessionCaptor =
        ArgumentCaptor.forClass(PerformanceSnapShot.class);

    verify(performanceStore).create(sessionCaptor.capture());

    rollbackTransaction();

    verify(performanceStore).delete(sessionCaptor.getValue());

    verifyNoInteractions(eventPublisher);
  }

  @Test
  @DisplayName("가창자가 아닌 참가자는 공연 준비를 요청할 수 없다")
  void prepareRejectsNonPerformer() {
    Room room = preparingRoom();

    RoomParticipant participant = participant(room, USER_ID, PARTICIPANT_ID);

    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    when(roomParticipantRepository.findByRoomIdAndUserId(ROOM_ID, USER_ID))
        .thenReturn(Optional.of(participant));

    assertWebSocketError(
        WebSocketErrorCode.PERFORMER_PERMISSION_REQUIRED,
        () -> performanceService.prepare(USER_ID, ROOM_ID, new PerformancePrepareRequest(SONG_ID)));

    verify(performanceStore, never()).nextPerformanceId();

    verify(performanceStore, never()).create(any(PerformanceSnapShot.class));

    verifyNoInteractions(songRepository, s3StorageService, eventPublisher);
  }

  @Test
  @DisplayName("방에 활성 공연이 이미 있으면 새로운 공연 준비 요청을 거부한다")
  void prepareRejectsWhenActivePerformanceAlreadyExists() {
    Room room = preparingRoom();
    RoomParticipant performer = performer(room);

    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    when(roomParticipantRepository.findByRoomIdAndUserId(ROOM_ID, USER_ID))
        .thenReturn(Optional.of(performer));

    when(performanceStore.findActiveByRoomId(ROOM_ID)).thenReturn(Optional.of(preparingSnapshot()));

    assertWebSocketError(
        WebSocketErrorCode.PERFORMANCE_ALREADY_IN_PROGRESS,
        () -> performanceService.prepare(USER_ID, ROOM_ID, new PerformancePrepareRequest(SONG_ID)));

    assertThat(room.getStatus()).isEqualTo(RoomStatus.PREPARING);

    verify(performanceStore, never()).nextPerformanceId();

    verify(performanceStore, never()).create(any(PerformanceSnapShot.class));

    verifyNoInteractions(songRepository, s3StorageService, eventPublisher);
  }

  @Test
  @DisplayName("동시 공연 준비 중 Redis 활성 공연 선점에 실패하면 중복 공연으로 거부한다")
  void prepareRejectsWhenRedisReservationLosesRace() {
    Room room = preparingRoom();
    RoomParticipant performer = performer(room);
    Song song = songWithResources();

    stubPrepareContext(room, performer, song);

    when(performanceStore.nextPerformanceId()).thenReturn(PERFORMANCE_ID);

    /*
     * findActiveByRoomId() 확인 시점에는 활성 공연이 없었지만,
     * 다른 요청이 먼저 Redis 활성 키를 선점한 상황이다.
     */
    when(performanceStore.create(any(PerformanceSnapShot.class))).thenReturn(false);

    assertWebSocketError(
        WebSocketErrorCode.PERFORMANCE_ALREADY_IN_PROGRESS,
        () -> performanceService.prepare(USER_ID, ROOM_ID, new PerformancePrepareRequest(SONG_ID)));

    assertThat(room.getStatus()).isEqualTo(RoomStatus.PREPARING);

    verify(performanceStore).create(any(PerformanceSnapShot.class));

    verifyNoInteractions(eventPublisher);
  }

  /*
   * 재생 시작
   */

  @Test
  @DisplayName("재생 시작은 상태를 PLAYING으로 저장하고 커밋 후 재생 시작 이벤트를 발행한다")
  void startPlaybackSavesPlayingStateAndPublishesAfterCommit() {
    Room room = playingRoom();

    stubPlayingContext(room, performer(room));

    PerformanceSnapShot preparing = preparingSnapshot();

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(preparing));

    beginTransaction();

    performanceService.startPlayback(USER_ID, ROOM_ID, PERFORMANCE_ID);

    ArgumentCaptor<PerformanceSnapShot> changedCaptor =
        ArgumentCaptor.forClass(PerformanceSnapShot.class);

    verify(performanceStore).save(changedCaptor.capture());

    PerformanceSnapShot changed = changedCaptor.getValue();

    assertThat(changed.status()).isEqualTo(PerformanceStatus.PLAYING);

    assertThat(changed.startedAt()).isNotNull().isAfterOrEqualTo(changed.preparedAt());

    verifyNoInteractions(eventPublisher);

    commitTransaction();

    verify(eventPublisher)
        .publish(
            ROOM_ID,
            PerformanceWebSocketEventType.PLAYBACK_STARTED,
            new PlaybackStartedPayload(PERFORMANCE_ID, PARTICIPANT_ID, changed.startedAt()));
  }

  @Test
  @DisplayName("가창자가 아닌 참가자는 재생 시작을 요청할 수 없다")
  void startPlaybackRejectsNonPerformer() {
    Room room = playingRoom();

    RoomParticipant participant = participant(room, USER_ID, PARTICIPANT_ID);

    stubPlayingContext(room, participant);

    assertWebSocketError(
        WebSocketErrorCode.PERFORMER_PERMISSION_REQUIRED,
        () -> performanceService.startPlayback(USER_ID, ROOM_ID, PERFORMANCE_ID));

    verify(performanceStore, never()).save(any(PerformanceSnapShot.class));

    verifyNoInteractions(eventPublisher);
  }

  @Test
  @DisplayName("요청한 방과 공연의 방이 다르면 재생 시작을 거부한다")
  void startPlaybackRejectsPerformanceFromAnotherRoom() {
    Room room = playingRoom();

    stubPlayingContext(room, performer(room));

    PerformanceSnapShot anotherRoomPerformance =
        PerformanceSnapShot.prepare(
            PERFORMANCE_ID, OTHER_ROOM_ID, PARTICIPANT_ID, USER_ID, SONG_ID, PREPARED_AT);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID))
        .thenReturn(Optional.of(anotherRoomPerformance));

    assertWebSocketError(
        WebSocketErrorCode.PERFORMANCE_ROOM_MISMATCH,
        () -> performanceService.startPlayback(USER_ID, ROOM_ID, PERFORMANCE_ID));

    verify(performanceStore, never()).save(any(PerformanceSnapShot.class));

    verifyNoInteractions(eventPublisher);
  }

  @Test
  @DisplayName("가창자 역할이 있어도 현재 공연의 실제 가창자가 아니면 재생 시작을 거부한다")
  void startPlaybackRejectsDifferentPerformer() {
    Room room = playingRoom();

    RoomParticipant anotherPerformer = performer(room, OTHER_USER_ID, OTHER_PARTICIPANT_ID);

    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    when(roomParticipantRepository.findByRoomIdAndUserId(ROOM_ID, OTHER_USER_ID))
        .thenReturn(Optional.of(anotherPerformer));

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID))
        .thenReturn(Optional.of(preparingSnapshot()));

    assertWebSocketError(
        WebSocketErrorCode.PERFORMER_PERMISSION_REQUIRED,
        () -> performanceService.startPlayback(OTHER_USER_ID, ROOM_ID, PERFORMANCE_ID));

    verify(performanceStore, never()).save(any(PerformanceSnapShot.class));

    verifyNoInteractions(eventPublisher);
  }

  /*
   * 재생 종료
   */

  @Test
  @DisplayName("재생 종료는 상태를 ANALYZING으로 저장하고 커밋 후 재생 종료 이벤트를 발행한다")
  void finishPlaybackSavesAnalyzingStateAndPublishesAfterCommit() {
    Room room = playingRoom();

    stubPlayingContext(room, performer(room));

    PerformanceSnapShot playing = preparingSnapshot().startPlayback(STARTED_AT);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(playing));

    beginTransaction();

    performanceService.finishPlayback(USER_ID, ROOM_ID, PERFORMANCE_ID);

    ArgumentCaptor<PerformanceSnapShot> changedCaptor =
        ArgumentCaptor.forClass(PerformanceSnapShot.class);

    verify(performanceStore).save(changedCaptor.capture());

    PerformanceSnapShot changed = changedCaptor.getValue();

    assertThat(changed.status()).isEqualTo(PerformanceStatus.ANALYZING);

    assertThat(changed.playbackFinishedAt()).isNotNull().isAfterOrEqualTo(STARTED_AT);

    verify(recoveryDeadlineStore)
        .save(PERFORMANCE_ID, changed.playbackFinishedAt().toInstant().plusSeconds(120));

    verifyNoInteractions(eventPublisher);

    commitTransaction();

    verify(eventPublisher)
        .publish(
            ROOM_ID,
            PerformanceWebSocketEventType.PLAYBACK_FINISHED,
            new PlaybackFinishedPayload(
                PERFORMANCE_ID, PARTICIPANT_ID, changed.playbackFinishedAt()));
  }

  @Test
  @DisplayName("재생 종료 트랜잭션이 롤백되면 분석 마감 예약과 스냅샷을 복구한다")
  void finishPlaybackRestoresDeadlineAndSnapshotOnRollback() {
    Room room = playingRoom();
    stubPlayingContext(room, performer(room));

    PerformanceSnapShot playing = preparingSnapshot().startPlayback(STARTED_AT);
    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(playing));

    beginTransaction();

    performanceService.finishPlayback(USER_ID, ROOM_ID, PERFORMANCE_ID);
    rollbackTransaction();

    verify(recoveryDeadlineStore).delete(PERFORMANCE_ID);
    verify(performanceStore).save(playing);
    verifyNoInteractions(eventPublisher);
  }

  @Test
  @DisplayName("가창자가 아닌 참가자는 재생 종료를 요청할 수 없다")
  void finishPlaybackRejectsNonPerformer() {
    Room room = playingRoom();

    RoomParticipant participant = participant(room, USER_ID, PARTICIPANT_ID);

    stubPlayingContext(room, participant);

    assertWebSocketError(
        WebSocketErrorCode.PERFORMER_PERMISSION_REQUIRED,
        () -> performanceService.finishPlayback(USER_ID, ROOM_ID, PERFORMANCE_ID));

    verify(performanceStore, never()).save(any(PerformanceSnapShot.class));

    verifyNoInteractions(eventPublisher);
  }

  /*
   * 공연 설정
   */

  @Test
  @DisplayName("GENERAL 모드에서 설정이 변경되면 스냅샷 저장 후 커밋 뒤 설정 변경 이벤트를 발행한다")
  void changeSettingsSavesAndPublishesChangedSettings() {
    Room room = playingRoom();

    stubPlayingContext(room, performer(room));

    PerformanceSnapShot playing = preparingSnapshot().startPlayback(STARTED_AT);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(playing));

    PerformanceSettingsChangeRequest request =
        new PerformanceSettingsChangeRequest(2, 110, 80, 90, 20, 30);

    beginTransaction();

    performanceService.changeSettings(USER_ID, ROOM_ID, PERFORMANCE_ID, request);

    ArgumentCaptor<PerformanceSnapShot> changedCaptor =
        ArgumentCaptor.forClass(PerformanceSnapShot.class);

    verify(performanceStore).save(changedCaptor.capture());

    PerformanceSnapShot changed = changedCaptor.getValue();

    assertThat(changed.settings()).isEqualTo(new PerformanceSettings(2, 110, 80, 90, 20, 30));

    verifyNoInteractions(eventPublisher);

    commitTransaction();

    verify(eventPublisher)
        .publish(
            ROOM_ID,
            PerformanceWebSocketEventType.PERFORMANCE_SETTINGS_CHANGED,
            new PerformanceSettingsChangedPayload(
                PARTICIPANT_ID, new PerformanceSettingsPayload(2, 110, 80, 90, 20, 30)));
  }

  @Test
  @DisplayName("동일한 공연 설정 요청은 Redis 저장과 이벤트 발행을 생략한다")
  void changeSettingsDoesNothingWhenSettingsAreUnchanged() {
    Room room = playingRoom();

    stubPlayingContext(room, performer(room));

    PerformanceSnapShot playing = preparingSnapshot().startPlayback(STARTED_AT);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(playing));

    PerformanceSettingsChangeRequest request =
        new PerformanceSettingsChangeRequest(0, 100, 100, 100, 0, 0);

    beginTransaction();

    performanceService.changeSettings(USER_ID, ROOM_ID, PERFORMANCE_ID, request);

    commitTransaction();

    verify(performanceStore, never()).save(any(PerformanceSnapShot.class));

    verifyNoInteractions(eventPublisher);
  }

  @Test
  @DisplayName("가창자가 아닌 참가자는 공연 설정을 변경할 수 없다")
  void changeSettingsRejectsNonPerformer() {
    Room room = playingRoom();

    RoomParticipant participant = participant(room, USER_ID, PARTICIPANT_ID);

    stubPlayingContext(room, participant);

    PerformanceSettingsChangeRequest request =
        new PerformanceSettingsChangeRequest(0, 100, 100, 100, 10, 10);

    assertWebSocketError(
        WebSocketErrorCode.PERFORMER_PERMISSION_REQUIRED,
        () -> performanceService.changeSettings(USER_ID, ROOM_ID, PERFORMANCE_ID, request));

    verify(performanceStore, never()).save(any(PerformanceSnapShot.class));

    verifyNoInteractions(eventPublisher);
  }

  @Test
  @DisplayName("BATTLE 모드에서 공연자는 키를 직접 변경할 수 없다")
  void changeSettingsRejectsKeyChangeInBattleMode() {
    Room room = battlePlayingRoom();

    stubPlayingContext(room, performer(room));

    PerformanceSnapShot playing = preparingSnapshot().startPlayback(STARTED_AT);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(playing));

    PerformanceSettingsChangeRequest request =
        new PerformanceSettingsChangeRequest(1, 100, 100, 100, 0, 0);

    assertWebSocketBusinessException(
        () -> performanceService.changeSettings(USER_ID, ROOM_ID, PERFORMANCE_ID, request));

    verify(performanceStore, never()).save(any(PerformanceSnapShot.class));

    verifyNoInteractions(eventPublisher);
  }

  @Test
  @DisplayName("BATTLE 모드에서 공연자는 템포를 직접 변경할 수 없다")
  void changeSettingsRejectsTempoChangeInBattleMode() {
    Room room = battlePlayingRoom();

    stubPlayingContext(room, performer(room));

    PerformanceSnapShot playing = preparingSnapshot().startPlayback(STARTED_AT);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(playing));

    PerformanceSettingsChangeRequest request =
        new PerformanceSettingsChangeRequest(0, 110, 100, 100, 0, 0);

    assertWebSocketBusinessException(
        () -> performanceService.changeSettings(USER_ID, ROOM_ID, PERFORMANCE_ID, request));

    verify(performanceStore, never()).save(any(PerformanceSnapShot.class));

    verifyNoInteractions(eventPublisher);
  }

  @Test
  @DisplayName("BATTLE 모드에서 공연자는 MR 볼륨을 직접 변경할 수 없다")
  void changeSettingsRejectsMrVolumeChangeInBattleMode() {
    Room room = battlePlayingRoom();

    stubPlayingContext(room, performer(room));

    PerformanceSnapShot playing = preparingSnapshot().startPlayback(STARTED_AT);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(playing));

    PerformanceSettingsChangeRequest request =
        new PerformanceSettingsChangeRequest(0, 100, 80, 100, 0, 0);

    assertWebSocketBusinessException(
        () -> performanceService.changeSettings(USER_ID, ROOM_ID, PERFORMANCE_ID, request));

    verify(performanceStore, never()).save(any(PerformanceSnapShot.class));

    verifyNoInteractions(eventPublisher);
  }

  @Test
  @DisplayName("BATTLE 모드에서도 공연자는 리버브와 에코를 변경할 수 있다")
  void changeSettingsAllowsReverbAndEchoInBattleMode() {
    Room room = battlePlayingRoom();

    stubPlayingContext(room, performer(room));

    PerformanceSnapShot playing = preparingSnapshot().startPlayback(STARTED_AT);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(playing));

    PerformanceSettingsChangeRequest request =
        new PerformanceSettingsChangeRequest(0, 100, 100, 100, 20, 30);

    beginTransaction();

    performanceService.changeSettings(USER_ID, ROOM_ID, PERFORMANCE_ID, request);

    ArgumentCaptor<PerformanceSnapShot> changedCaptor =
        ArgumentCaptor.forClass(PerformanceSnapShot.class);

    verify(performanceStore).save(changedCaptor.capture());

    assertThat(changedCaptor.getValue().settings())
        .isEqualTo(new PerformanceSettings(0, 100, 100, 100, 20, 30));

    verifyNoInteractions(eventPublisher);

    commitTransaction();

    verify(eventPublisher)
        .publish(
            ROOM_ID,
            PerformanceWebSocketEventType.PERFORMANCE_SETTINGS_CHANGED,
            new PerformanceSettingsChangedPayload(
                PARTICIPANT_ID, new PerformanceSettingsPayload(0, 100, 100, 100, 20, 30)));
  }

  /*
   * 공연 취소
   */

  @Test
  @DisplayName("공연 취소는 상태 저장 후 커밋 뒤 Redis 세션 삭제와 취소 이벤트 발행을 수행한다")
  void cancelDeletesSessionAndPublishesEventAfterCommit() {
    Room room = playingRoom();

    stubPlayingContext(room, performer(room));

    PerformanceSnapShot playing = preparingSnapshot().startPlayback(STARTED_AT);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(playing));

    beginTransaction();

    performanceService.cancel(USER_ID, ROOM_ID, PERFORMANCE_ID);

    ArgumentCaptor<PerformanceSnapShot> cancelledCaptor =
        ArgumentCaptor.forClass(PerformanceSnapShot.class);

    verify(performanceStore).save(cancelledCaptor.capture());

    PerformanceSnapShot cancelled = cancelledCaptor.getValue();

    assertThat(cancelled.status()).isEqualTo(PerformanceStatus.CANCELLED);

    assertThat(room.getStatus()).isEqualTo(RoomStatus.PREPARING);

    verify(performanceStore, never()).delete(any(PerformanceSnapShot.class));

    verifyNoInteractions(eventPublisher);

    commitTransaction();

    InOrder commitOrder = inOrder(performanceStore, eventPublisher);

    commitOrder.verify(performanceStore).delete(cancelled);

    commitOrder
        .verify(eventPublisher)
        .publish(
            ROOM_ID,
            PerformanceWebSocketEventType.PERFORMANCE_CANCELLED,
            new PerformanceCancelledPayload(
                PERFORMANCE_ID,
                PARTICIPANT_ID,
                PerformanceStatus.PLAYING,
                PerformanceStatus.CANCELLED,
                RoomStatus.PREPARING,
                PerformanceCancelReason.PERFORMER_REQUEST));
  }

  @Test
  @DisplayName("가창자가 아닌 참가자는 공연을 취소할 수 없다")
  void cancelRejectsNonPerformer() {
    Room room = playingRoom();

    RoomParticipant participant = participant(room, USER_ID, PARTICIPANT_ID);

    stubPlayingContext(room, participant);

    assertWebSocketError(
        WebSocketErrorCode.PERFORMER_PERMISSION_REQUIRED,
        () -> performanceService.cancel(USER_ID, ROOM_ID, PERFORMANCE_ID));

    verify(performanceStore, never()).save(any(PerformanceSnapShot.class));

    verify(performanceStore, never()).delete(any(PerformanceSnapShot.class));

    verifyNoInteractions(eventPublisher);
  }

  /*
   * 상태 전이
   */

  @Test
  @DisplayName("허용되지 않은 공연 상태 전이는 비즈니스 예외로 변환하고 저장하거나 발행하지 않는다")
  void invalidStateTransitionIsConvertedToBusinessException() {
    Room room = playingRoom();

    stubPlayingContext(room, performer(room));

    PerformanceSnapShot playing = preparingSnapshot().startPlayback(STARTED_AT);

    when(performanceStore.findByPerformanceId(PERFORMANCE_ID)).thenReturn(Optional.of(playing));

    assertWebSocketError(
        WebSocketErrorCode.INVALID_PERFORMANCE_STATE,
        () -> performanceService.startPlayback(USER_ID, ROOM_ID, PERFORMANCE_ID));

    verify(performanceStore, never()).save(any(PerformanceSnapShot.class));

    verifyNoInteractions(eventPublisher);
  }

  /*
   * 테스트 헬퍼
   */

  private void stubPrepareContext(Room room, RoomParticipant performer, Song song) {
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    when(roomParticipantRepository.findByRoomIdAndUserId(ROOM_ID, USER_ID))
        .thenReturn(Optional.of(performer));

    when(performanceStore.findActiveByRoomId(ROOM_ID)).thenReturn(Optional.empty());

    when(songRepository.findById(SONG_ID)).thenReturn(Optional.of(song));
  }

  private void stubPlayingContext(Room room, RoomParticipant performer) {
    when(roomRepository.findByIdForUpdate(ROOM_ID)).thenReturn(Optional.of(room));

    when(roomParticipantRepository.findByRoomIdAndUserId(ROOM_ID, USER_ID))
        .thenReturn(Optional.of(performer));
  }

  private Room preparingRoom() {
    Room room =
        Room.create(
            "ABC123",
            "테스트 방",
            RoomMode.GENERAL,
            user(USER_ID),
            "openvidu-session",
            LocalDateTime.of(2026, 7, 28, 9, 0));

    ReflectionTestUtils.setField(room, "id", ROOM_ID);

    return room;
  }

  private Room playingRoom() {
    Room room = preparingRoom();
    room.startPerformance();
    return room;
  }

  private Room battlePlayingRoom() {
    Room room =
        Room.create(
            "BAT123",
            "수성전 방",
            RoomMode.BATTLE,
            user(USER_ID),
            "openvidu-battle-session",
            LocalDateTime.of(2026, 7, 28, 9, 0));

    ReflectionTestUtils.setField(room, "id", ROOM_ID);

    room.startPerformance();

    return room;
  }

  private RoomParticipant participant(Room room, Long userId, Long participantId) {
    RoomParticipant participant =
        RoomParticipant.join(room, user(userId), LocalDateTime.of(2026, 7, 28, 9, 1));

    ReflectionTestUtils.setField(participant, "id", participantId);

    return participant;
  }

  private RoomParticipant performer(Room room) {
    return performer(room, USER_ID, PARTICIPANT_ID);
  }

  private RoomParticipant performer(Room room, Long userId, Long participantId) {
    RoomParticipant participant = participant(room, userId, participantId);

    participant.promoteToPerformer();

    return participant;
  }

  private Song songWithResources() {
    Song song =
        Song.create(
            "테스트 곡",
            "테스트 가수",
            180,
            3,
            "songs/20/cover.jpg",
            "songs/20/mr.mp3",
            "songs/20/midi.json",
            "songs/20/lyrics.json");

    ReflectionTestUtils.setField(song, "id", SONG_ID);

    return song;
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

  private PerformanceSnapShot preparingSnapshot() {
    return PerformanceSnapShot.prepare(
        PERFORMANCE_ID, ROOM_ID, PARTICIPANT_ID, USER_ID, SONG_ID, PREPARED_AT);
  }

  private void assertWebSocketError(WebSocketErrorCode expectedErrorCode, Runnable action) {
    assertThatThrownBy(action::run)
        .isInstanceOfSatisfying(
            WebSocketBusinessException.class,
            exception -> assertThat(exception.getErrorCode()).isEqualTo(expectedErrorCode));
  }

  /*
   * BATTLE 설정 제한용 오류 코드가 아직 확정되지 않았으므로
   * 우선 비즈니스 예외 발생과 미저장만 검증한다.
   *
   * 전용 코드가 추가되면 assertWebSocketError(...)로 교체하면 된다.
   */
  private void assertWebSocketBusinessException(Runnable action) {
    assertThatThrownBy(action::run).isInstanceOf(WebSocketBusinessException.class);
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
