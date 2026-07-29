package com.ssafy.ssasukae.domain.performance.service;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryDeadlineStore;
import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryProperties;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSettings;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.type.PerformanceCancelReason;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventType;
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
import com.ssafy.ssasukae.global.exception.websocket.WebSocketBusinessException;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketErrorCode;
import com.ssafy.ssasukae.integration.aws.S3StorageService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class PerformanceService {

  private static final ZoneId SEOUL_ZONE_ID = ZoneId.of("Asia/Seoul");

  private final RoomRepository roomRepository;
  private final RoomParticipantRepository roomParticipantRepository;
  private final SongRepository songRepository;
  private final PerformanceStore performanceStore;
  private final PerformanceRecoveryDeadlineStore recoveryDeadlineStore;
  private final PerformanceRecoveryProperties recoveryProperties;
  private final PerformanceTransactionSupport transactionSupport;
  private final PerformanceCancellationProcessor cancellationProcessor;
  private final S3StorageService s3StorageService;
  private final PerformanceWebSocketEventPublisher eventPublisher;

  /** 공연 준비를 시작한다. */
  @Transactional
  public void prepare(Long userId, Long roomId, PerformancePrepareRequest request) {
    if (request == null) {
      throw business(WebSocketErrorCode.INVALID_REQUEST, "공연 준비 요청은 필수입니다.");
    }

    // 정합성 검사
    validatePositive(userId, "userId");
    validatePositive(roomId, "roomId");
    validatePositive(request.songId(), "songId");

    // 현재 방과 지금 가창자가 DB에 있는지 확인
    Room room = getRoomForUpdate(roomId);
    RoomParticipant performer = getOnlinePerformer(roomId, userId);

    // 현재 방 상태가 PREPARING인지 확인
    validateRoomPreparing(room);

    Song song =
        songRepository
            .findById(request.songId())
            .orElseThrow(
                () -> business(WebSocketErrorCode.RESOURCE_NOT_FOUND, "요청한 곡이 존재하지 않습니다."));
    // 가져온 song에 문제 없는지 확인
    validatePerformanceResources(song);
    String mrDownloadUrl = createPresignedUrl(song.getMrObjectKey());
    String midiJsonDownloadUrl = createPresignedUrl(song.getMidiObjectKey());

    // 지금 현재 상태를 snapshot으로 남김
    PerformanceSnapShot snapShot =
        PerformanceSnapShot.prepare(
            performanceStore.nextPerformanceId(),
            roomId,
            performer.getId(),
            userId,
            song.getId(),
            now());
    // snapshot대로 redis에 저장
    if (!performanceStore.create(snapShot)) {
      throw business(WebSocketErrorCode.PERFORMANCE_ALREADY_IN_PROGRESS);
    }
    // DB 롤백이 발생할 시에 방금 거 redis에서도 롤백
    transactionSupport.restoreOnRollback(() -> performanceStore.delete(snapShot));

    // Redis 활성 공연 선점에 성공한 뒤 DB 방 상태를 변경
    room.startPerformance();

    // 정상적으로 DB에 저장이 되었으면 이벤트 발행
    transactionSupport.afterCommit(
        () -> {
          eventPublisher.publish(
              roomId,
              PerformanceWebSocketEventType.PERFORMANCE_STARTED,
              new PerformanceStartedPayload(
                  snapShot.performanceId(),
                  snapShot.performerParticipantId(),
                  snapShot.songId(),
                  snapShot.status(),
                  RoomStatus.PLAYING));

          eventPublisher.publish(
              roomId,
              PerformanceWebSocketEventType.PERFORMANCE_PREPARATION_STARTED,
              new PerformancePreparationStartedPayload(
                  snapShot.performanceId(),
                  snapShot.performerParticipantId(),
                  snapShot.songId(),
                  song.getTitle(),
                  mrDownloadUrl,
                  midiJsonDownloadUrl));
        });
  }

  /** 실제 음원 재생을 시작한다. */
  @Transactional
  public void startPlayback(Long userId, Long roomId, Long performanceId) {
    validatePlayingRoomAndPerformer(userId, roomId);

    PerformanceSnapShot previous = getValidatedSnapShot(roomId, performanceId, userId);

    PerformanceSnapShot changed;

    try {
      changed = previous.startPlayback(now());
    } catch (IllegalStateException exception) {
      throw invalidPerformanceState(exception);
    }

    transactionSupport.saveWithRollback(previous, changed);

    transactionSupport.afterCommit(
        () ->
            eventPublisher.publish(
                roomId,
                PerformanceWebSocketEventType.PLAYBACK_STARTED,
                new PlaybackStartedPayload(
                    changed.performanceId(),
                    changed.performerParticipantId(),
                    changed.startedAt())));
  }

  /** 실제 음원 재생을 종료한다. */
  @Transactional
  public void finishPlayback(Long userId, Long roomId, Long performanceId) {
    validatePlayingRoomAndPerformer(userId, roomId);

    PerformanceSnapShot previous = getValidatedSnapShot(roomId, performanceId, userId);

    PerformanceSnapShot changed;

    try {
      changed = previous.finishPlayback(now());
    } catch (IllegalStateException exception) {
      throw invalidPerformanceState(exception);
    }

    transactionSupport.saveWithRollback(previous, changed);
    recoveryDeadlineStore.save(
        changed.performanceId(),
        changed.playbackFinishedAt().toInstant().plus(recoveryProperties.getAnalysisTimeout()));
    transactionSupport.restoreOnRollback(
        () -> recoveryDeadlineStore.delete(changed.performanceId()));

    transactionSupport.afterCommit(
        () ->
            eventPublisher.publish(
                roomId,
                PerformanceWebSocketEventType.PLAYBACK_FINISHED,
                new PlaybackFinishedPayload(
                    changed.performanceId(),
                    changed.performerParticipantId(),
                    changed.playbackFinishedAt())));
  }

  /** 공연 설정을 변경한다. */
  @Transactional
  public void changeSettings(
      Long userId, Long roomId, Long performanceId, PerformanceSettingsChangeRequest request) {
    validateSettings(request);
    Room room = validatePlayingRoomAndPerformer(userId, roomId);

    PerformanceSnapShot previous = getValidatedSnapShot(roomId, performanceId, userId);

    validateBattleModeSettings(room, previous.settings(), request);

    PerformanceSettings settings =
        new PerformanceSettings(
            request.keyOffset(),
            request.tempoPercent(),
            request.mrVolumePercent(),
            request.micVolumePercent(),
            request.echoLevel(),
            request.reverbLevel());

    PerformanceSnapShot changed;

    try {
      changed = previous.changeSettings(settings);
    } catch (IllegalStateException exception) {
      throw invalidPerformanceState(exception);
    }

    if (changed == previous) {
      return;
    }

    transactionSupport.saveWithRollback(previous, changed);

    transactionSupport.afterCommit(
        () ->
            eventPublisher.publish(
                roomId,
                PerformanceWebSocketEventType.PERFORMANCE_SETTINGS_CHANGED,
                new PerformanceSettingsChangedPayload(
                    changed.performerParticipantId(),
                    PerformanceSettingsPayload.from(changed.settings()))));
  }

  /** 진행 중인 공연을 취소한다. */
  @Transactional
  public void cancel(Long userId, Long roomId, Long performanceId) {
    Room room = validatePlayingRoomAndPerformer(userId, roomId);

    PerformanceSnapShot previous = getValidatedSnapShot(roomId, performanceId, userId);

    try {
      cancellationProcessor.cancel(
          room, previous, PerformanceCancelReason.PERFORMER_REQUEST);
    } catch (IllegalStateException exception) {
      throw invalidPerformanceState(exception);
    }
  }

  private Room validatePlayingRoomAndPerformer(Long userId, Long roomId) {
    validatePositive(userId, "userId");
    validatePositive(roomId, "roomId");

    Room room = getRoomForUpdate(roomId);

    if (room.getStatus() != RoomStatus.PLAYING) {
      throw business(WebSocketErrorCode.INVALID_ROOM_STATE, "현재 공연 중인 방이 아닙니다.");
    }

    getOnlinePerformer(roomId, userId);

    return room;
  }

  // 현재 방이 DB에 있는지 확인
  private Room getRoomForUpdate(Long roomId) {
    return roomRepository
        .findByIdForUpdate(roomId)
        .orElseThrow(() -> business(WebSocketErrorCode.RESOURCE_NOT_FOUND, "요청한 방이 존재하지 않습니다."));
  }

  private RoomParticipant getOnlinePerformer(Long roomId, Long userId) {
    RoomParticipant participant =
        roomParticipantRepository
            .findByRoomIdAndUserId(roomId, userId)
            .orElseThrow(() -> business(WebSocketErrorCode.ROOM_ACCESS_DENIED));

    if (!participant.isActive() || !participant.isOnline()) {
      throw business(WebSocketErrorCode.ROOM_ACCESS_DENIED, "현재 방에 온라인으로 참가 중인 사용자가 아닙니다.");
    }

    if (!participant.isPerformer()) {
      throw business(WebSocketErrorCode.PERFORMER_PERMISSION_REQUIRED);
    }

    return participant;
  }

  private PerformanceSnapShot getValidatedSnapShot(Long roomId, Long performanceId, Long userId) {
    validatePositive(performanceId, "performanceId");

    PerformanceSnapShot snapShot =
        performanceStore
            .findByPerformanceId(performanceId)
            .orElseThrow(
                () -> business(WebSocketErrorCode.RESOURCE_NOT_FOUND, "요청한 공연이 존재하지 않습니다."));

    if (!snapShot.belongsToRoom(roomId)) {
      throw business(WebSocketErrorCode.PERFORMANCE_ROOM_MISMATCH);
    }

    if (!snapShot.performerUserId().equals(userId)) {
      throw business(WebSocketErrorCode.PERFORMER_PERMISSION_REQUIRED);
    }

    return snapShot;
  }

  private void validateRoomPreparing(Room room) {
    if (room.getStatus() != RoomStatus.PREPARING) {
      throw business(WebSocketErrorCode.INVALID_ROOM_STATE, "공연을 시작할 수 없는 방 상태입니다.");
    }

    if (performanceStore.findActiveByRoomId(room.getId()).isPresent()) {
      throw business(WebSocketErrorCode.PERFORMANCE_ALREADY_IN_PROGRESS);
    }
  }

  private void validatePerformanceResources(Song song) {
    if (!StringUtils.hasText(song.getMrObjectKey())
        || !StringUtils.hasText(song.getMidiObjectKey())) {
      throw business(WebSocketErrorCode.PERFORMANCE_RESOURCE_NOT_READY);
    }
  }

  private String createPresignedUrl(String objectKey) {
    try {
      return s3StorageService.presignedUrl(objectKey);
    } catch (RuntimeException exception) {
      throw business(
          WebSocketErrorCode.DOWNLOAD_URL_GENERATION_FAILED,
          WebSocketErrorCode.DOWNLOAD_URL_GENERATION_FAILED.getDefaultMessage(),
          objectKey);
    }
  }

  private void validateSettings(PerformanceSettingsChangeRequest request) {
    if (request == null) {
      throw business(WebSocketErrorCode.INVALID_REQUEST, "공연 설정 변경 요청은 필수입니다.");
    }

    boolean valid =
        isBetween(request.keyOffset(), -6, 6)
            && isBetween(request.tempoPercent(), 50, 150)
            && isBetween(request.mrVolumePercent(), 0, 100)
            && isBetween(request.micVolumePercent(), 0, 100)
            && isBetween(request.echoLevel(), 0, 100)
            && isBetween(request.reverbLevel(), 0, 100);

    if (!valid) {
      throw business(WebSocketErrorCode.INVALID_PERFORMANCE_SETTING);
    }
  }

  private boolean isBetween(Integer value, int minimum, int maximum) {
    return value != null && value >= minimum && value <= maximum;
  }

  private void validateBattleModeSettings(
      Room room, PerformanceSettings currentSettings, PerformanceSettingsChangeRequest request) {
    if (room.getMode() != RoomMode.BATTLE) {
      return;
    }

    boolean restrictedSettingChanged =
        !Objects.equals(request.keyOffset(), currentSettings.keyOffset())
            || !Objects.equals(request.tempoPercent(), currentSettings.tempoPercent())
            || !Objects.equals(request.mrVolumePercent(), currentSettings.mrVolumePercent());

    if (restrictedSettingChanged) {
      throw business(
          WebSocketErrorCode.INVALID_PERFORMANCE_SETTING,
          "BATTLE 모드에서는 공연자가 키, 템포, MR 볼륨을 직접 변경할 수 없습니다.");
    }
  }

  private WebSocketBusinessException invalidPerformanceState(IllegalStateException exception) {
    return business(WebSocketErrorCode.INVALID_PERFORMANCE_STATE, exception.getMessage());
  }

  private OffsetDateTime now() {
    return OffsetDateTime.now(SEOUL_ZONE_ID);
  }

  private void validatePositive(Long value, String fieldName) {
    if (value == null || value <= 0) {
      throw business(WebSocketErrorCode.INVALID_REQUEST, fieldName + "는 양의 정수여야 합니다.");
    }
  }

  private WebSocketBusinessException business(WebSocketErrorCode errorCode) {
    return new WebSocketBusinessException(errorCode);
  }

  private WebSocketBusinessException business(WebSocketErrorCode errorCode, String message) {
    return new WebSocketBusinessException(errorCode, message);
  }

  private WebSocketBusinessException business(
      WebSocketErrorCode errorCode, String message, Object details) {
    return new WebSocketBusinessException(errorCode, message, details);
  }
}
