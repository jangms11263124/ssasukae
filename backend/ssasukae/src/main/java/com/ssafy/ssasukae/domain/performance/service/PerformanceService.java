package com.ssafy.ssasukae.domain.performance.service;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.EnumSet;

import com.ssafy.ssasukae.domain.performance.dto.StartPerformanceRequest;
import com.ssafy.ssasukae.domain.performance.dto.StartPerformanceResult;
import com.ssafy.ssasukae.domain.performance.entity.Performance;
import com.ssafy.ssasukae.domain.performance.entity.PerformanceSettings;
import com.ssafy.ssasukae.domain.performance.event.PerformanceStartedDomainEvent;
import com.ssafy.ssasukae.domain.performance.repository.PerformanceRepository;
import com.ssafy.ssasukae.domain.performance.repository.PerformanceSettingsRepository;
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
