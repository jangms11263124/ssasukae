package com.ssafy.ssasukae.domain.performance.service;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.EnumSet;

import com.ssafy.ssasukae.domain.performance.dto.PerformanceSettingsResponse;
import com.ssafy.ssasukae.domain.performance.dto.PerformanceTransitionResult;
import com.ssafy.ssasukae.domain.performance.dto.StartPerformanceRequest;
import com.ssafy.ssasukae.domain.performance.dto.StartPerformanceResult;
import com.ssafy.ssasukae.domain.performance.dto.UpdatePerformanceSettingsRequest;
import com.ssafy.ssasukae.domain.performance.dto.UpdatePerformanceSettingsResult;
import com.ssafy.ssasukae.domain.performance.entity.Performance;
import com.ssafy.ssasukae.domain.performance.entity.PerformanceSettings;
import com.ssafy.ssasukae.domain.performance.event.PerformanceSettingsChangedDomainEvent;
import com.ssafy.ssasukae.domain.performance.event.PerformanceStartedDomainEvent;
import com.ssafy.ssasukae.domain.performance.event.PerformanceTransitionDomainEvent;
import com.ssafy.ssasukae.domain.performance.event.PerformanceTransitionKind;
import com.ssafy.ssasukae.domain.performance.repository.PerformanceRepository;
import com.ssafy.ssasukae.domain.performance.repository.PerformanceSettingsRepository;
import com.ssafy.ssasukae.domain.performance.type.PerformanceSettingsChangeSource;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.ParticipantRole;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import com.ssafy.ssasukae.global.exception.performance.PerformanceException;
import com.ssafy.ssasukae.global.exception.room.RoomException;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PerformanceService {

  private static final EnumSet<PerformanceStatus> ACTIVE_STATUSES =
      EnumSet.of(
          PerformanceStatus.PREPARING,
          PerformanceStatus.PLAYING,
          PerformanceStatus.ANALYZING);

  private final RoomRepository roomRepository;
  private final RoomParticipantRepository roomParticipantRepository;
  private final SongRepository songRepository;
  private final PerformanceRepository performanceRepository;
  private final PerformanceSettingsRepository performanceSettingsRepository;
  private final ApplicationEventPublisher applicationEventPublisher;
  private final Clock clock;

  public PerformanceService(
      RoomRepository roomRepository,
      RoomParticipantRepository roomParticipantRepository,
      SongRepository songRepository,
      PerformanceRepository performanceRepository,
      PerformanceSettingsRepository performanceSettingsRepository,
      ApplicationEventPublisher applicationEventPublisher,
      Clock clock) {
    this.roomRepository = roomRepository;
    this.roomParticipantRepository = roomParticipantRepository;
    this.songRepository = songRepository;
    this.performanceRepository = performanceRepository;
    this.performanceSettingsRepository = performanceSettingsRepository;
    this.applicationEventPublisher = applicationEventPublisher;
    this.clock = clock;
  }

  @Transactional
  public StartPerformanceResult startPerformance(
      Long roomId, Long requesterUserId, StartPerformanceRequest request) {
    Room room =
        roomRepository.findByIdForUpdate(roomId).orElseThrow(RoomException::notFound);

    validateNoActivePerformance(roomId);
    validateRoomStartable(room);

    RoomParticipant requester = findRequester(roomId, requesterUserId);
    validateHost(requester);

    RoomParticipant performer = findPerformer(roomId, request.performerParticipantId());
    validateOnlinePerformer(performer);

    Song song =
        songRepository
            .findById(request.songId())
            .orElseThrow(PerformanceException::songNotFound);
    if (!song.isReady()) {
      throw PerformanceException.songNotReady();
    }

    int roundNo = performanceRepository.findMaxRoundNoByRoomId(roomId) + 1;
    LocalDateTime now = LocalDateTime.now(clock);

    Performance performance =
        performanceRepository.save(Performance.prepare(room, performer, song, roundNo, now));
    performanceSettingsRepository.save(PerformanceSettings.defaults(performance));

    long roomVersion = room.startPerformance(now);

    applicationEventPublisher.publishEvent(
        new PerformanceStartedDomainEvent(
            roomId,
            roomVersion,
            performance.getId(),
            performer.getId(),
            song.getId(),
            roundNo,
            performance.getStatus()));

    return new StartPerformanceResult(
        performance.getId(),
        performer.getId(),
        song.getId(),
        roundNo,
        performance.getStatus());
  }

  @Transactional
  public PerformanceTransitionResult startPlayback(
      Long roomId, Long performanceId, Long requesterUserId) {
    Room room = lockRoom(roomId);
    validateRoomPlaying(room);

    Performance performance = findPerformance(roomId, performanceId);
    RoomParticipant requester = findOnlineRequester(roomId, requesterUserId);
    validatePlaybackRequester(performance, requester);

    PerformanceStatus previousStatus = performance.getStatus();
    LocalDateTime now = LocalDateTime.now(clock);
    boolean changed = performance.startPlayback(now);
    if (!changed) {
      return transitionResult(performance, performance.getPlaybackStartedAt(), false);
    }

    publishTransition(
        room,
        performance,
        requester,
        previousStatus,
        now,
        PerformanceTransitionKind.PLAYBACK_STARTED,
        false);
    return transitionResult(performance, now, true);
  }

  @Transactional
  public PerformanceTransitionResult finishPlayback(
      Long roomId, Long performanceId, Long requesterUserId) {
    Room room = lockRoom(roomId);
    validateRoomPlaying(room);

    Performance performance = findPerformance(roomId, performanceId);
    RoomParticipant requester = findOnlineRequester(roomId, requesterUserId);
    validatePlaybackRequester(performance, requester);

    PerformanceStatus previousStatus = performance.getStatus();
    LocalDateTime now = LocalDateTime.now(clock);
    boolean changed = performance.finishPlayback(now);
    if (!changed) {
      return transitionResult(performance, performance.getPlaybackFinishedAt(), false);
    }

    publishTransition(
        room,
        performance,
        requester,
        previousStatus,
        now,
        PerformanceTransitionKind.PLAYBACK_FINISHED,
        false);
    return transitionResult(performance, now, true);
  }

  @Transactional
  public PerformanceTransitionResult cancelPerformance(
      Long roomId, Long performanceId, Long requesterUserId) {
    Room room = lockRoom(roomId);
    if (room.getStatus() == RoomStatus.FINISHED) {
      throw RoomException.closed();
    }

    Performance performance = findPerformance(roomId, performanceId);
    RoomParticipant requester = findOnlineRequester(roomId, requesterUserId);
    validateCancelRequester(performance, requester);

    PerformanceStatus previousStatus = performance.getStatus();
    LocalDateTime now = LocalDateTime.now(clock);
    boolean changed = performance.cancel(now);
    if (!changed) {
      return transitionResult(performance, performance.getCancelledAt(), false);
    }

    publishTransition(
        room,
        performance,
        requester,
        previousStatus,
        now,
        PerformanceTransitionKind.PERFORMANCE_CANCELLED,
        true);
    return transitionResult(performance, now, true);
  }

  @Transactional(readOnly = true)
  public PerformanceSettingsResponse getPerformanceSettings(
      Long roomId, Long performanceId, Long requesterUserId) {
    Performance performance = findPerformance(roomId, performanceId);
    findRequester(roomId, requesterUserId);
    return PerformanceSettingsResponse.from(findSettings(performance.getId()));
  }

  @Transactional
  public UpdatePerformanceSettingsResult updatePerformanceSettings(
      Long roomId,
      Long performanceId,
      Long requesterUserId,
      UpdatePerformanceSettingsRequest request) {
    Room room = lockRoom(roomId);
    validateRoomPlaying(room);

    Performance performance = findPerformance(roomId, performanceId);
    validateSettingsChangeable(performance);

    RoomParticipant requester = findOnlineRequester(roomId, requesterUserId);
    validateSettingsRequester(performance, requester);

    PerformanceSettings settings = findSettings(performanceId);
    settings.validateExpectedVersion(request.expectedVersion());

    boolean changed =
        settings.updateUserSettings(
            request.keyOffset(),
            request.tempoPercent(),
            request.mrVolumePercent(),
            request.micVolumePercent(),
            request.echoLevel(),
            request.reverbLevel());
    if (!changed) {
      return UpdatePerformanceSettingsResult.from(settings, false);
    }

    try {
      performanceSettingsRepository.saveAndFlush(settings);
    } catch (ObjectOptimisticLockingFailureException exception) {
      throw PerformanceException.settingsConcurrentUpdate();
    }

    LocalDateTime now = LocalDateTime.now(clock);
    long roomVersion = room.increaseVersion(now);
    applicationEventPublisher.publishEvent(
        new PerformanceSettingsChangedDomainEvent(
            roomId,
            roomVersion,
            performanceId,
            requester.getId(),
            PerformanceSettingsChangeSource.USER,
            settings.getVersion(),
            settings.getKeyOffset(),
            settings.getTempoPercent(),
            settings.getMrVolumePercent(),
            settings.getMicVolumePercent(),
            settings.getEchoLevel(),
            settings.getReverbLevel()));

    return UpdatePerformanceSettingsResult.from(settings, true);
  }

  private Room lockRoom(Long roomId) {
    return roomRepository.findByIdForUpdate(roomId).orElseThrow(RoomException::notFound);
  }

  private Performance findPerformance(Long roomId, Long performanceId) {
    return performanceRepository
        .findByIdAndRoom_Id(performanceId, roomId)
        .orElseThrow(PerformanceException::notFound);
  }

  private PerformanceSettings findSettings(Long performanceId) {
    return performanceSettingsRepository
        .findByPerformance_Id(performanceId)
        .orElseThrow(PerformanceException::settingsNotFound);
  }

  private void validateSettingsChangeable(Performance performance) {
    if (performance.getStatus() != PerformanceStatus.PREPARING
        && performance.getStatus() != PerformanceStatus.PLAYING) {
      throw PerformanceException.settingsChangeNotAllowed(performance.getStatus());
    }
  }

  private void validateSettingsRequester(
      Performance performance, RoomParticipant requester) {
    if (!performance.getPerformer().getId().equals(requester.getId())) {
      throw PerformanceException.settingsPermissionRequired();
    }
  }

  private RoomParticipant findOnlineRequester(Long roomId, Long requesterUserId) {
    RoomParticipant requester = findRequester(roomId, requesterUserId);
    if (requester.getConnectionStatus() != ConnectionStatus.ONLINE) {
      throw PerformanceException.requesterNotOnline();
    }
    return requester;
  }

  private void validatePlaybackRequester(
      Performance performance, RoomParticipant requester) {
    if (!performance.getPerformer().getId().equals(requester.getId())) {
      throw PerformanceException.playbackPermissionRequired();
    }
  }

  private void validateCancelRequester(
      Performance performance, RoomParticipant requester) {
    boolean isHost = requester.getRole() == ParticipantRole.HOST;
    boolean isPerformer = performance.getPerformer().getId().equals(requester.getId());
    if (!isHost && !isPerformer) {
      throw PerformanceException.cancelPermissionRequired();
    }
  }

  private void publishTransition(
      Room room,
      Performance performance,
      RoomParticipant requester,
      PerformanceStatus previousStatus,
      LocalDateTime changedAt,
      PerformanceTransitionKind kind,
      boolean returnRoomToPreparing) {
    long stateChangedRoomVersion =
        returnRoomToPreparing
            ? room.cancelPerformance(changedAt)
            : room.recordPerformanceProgress(changedAt);
    long specificRoomVersion = room.increaseVersion(changedAt);

    applicationEventPublisher.publishEvent(
        new PerformanceTransitionDomainEvent(
            room.getId(),
            stateChangedRoomVersion,
            specificRoomVersion,
            performance.getId(),
            performance.getPerformer().getId(),
            requester.getId(),
            previousStatus,
            performance.getStatus(),
            performance.getVersion(),
            room.getStatus(),
            changedAt,
            kind));
  }

  private PerformanceTransitionResult transitionResult(
      Performance performance, LocalDateTime changedAt, boolean changed) {
    return new PerformanceTransitionResult(
        performance.getId(),
        performance.getStatus(),
        performance.getVersion(),
        changedAt,
        changed);
  }

  private void validateNoActivePerformance(Long roomId) {
    if (performanceRepository.existsByRoom_IdAndStatusIn(roomId, ACTIVE_STATUSES)) {
      throw PerformanceException.alreadyActive();
    }
  }

  private void validateRoomStartable(Room room) {
    if (room.getStatus() == RoomStatus.FINISHED) {
      throw RoomException.closed();
    }
    if (room.getStatus() != RoomStatus.PREPARING) {
      throw RoomException.notReadyForPerformance();
    }
  }

  private void validateRoomPlaying(Room room) {
    if (room.getStatus() == RoomStatus.FINISHED) {
      throw RoomException.closed();
    }
    if (room.getStatus() != RoomStatus.PLAYING) {
      throw PerformanceException.roomNotPlaying();
    }
  }

  private RoomParticipant findRequester(Long roomId, Long requesterUserId) {
    return roomParticipantRepository
        .findByRoom_IdAndUser_Id(roomId, requesterUserId)
        .filter(RoomParticipant::isActive)
        .orElseThrow(RoomException::accessDenied);
  }

  private void validateHost(RoomParticipant requester) {
    if (requester.getRole() != ParticipantRole.HOST) {
      throw PerformanceException.hostPermissionRequired();
    }
    if (requester.getConnectionStatus() != ConnectionStatus.ONLINE) {
      throw PerformanceException.requesterNotOnline();
    }
  }

  private RoomParticipant findPerformer(Long roomId, Long performerParticipantId) {
    return roomParticipantRepository
        .findByIdAndRoom_Id(performerParticipantId, roomId)
        .orElseThrow(PerformanceException::performerNotFound);
  }

  private void validateOnlinePerformer(RoomParticipant performer) {
    if (performer.getConnectionStatus() != ConnectionStatus.ONLINE) {
      throw PerformanceException.performerNotOnline();
    }
  }
}
