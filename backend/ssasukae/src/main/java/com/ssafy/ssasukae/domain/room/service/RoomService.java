package com.ssafy.ssasukae.domain.room.service;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.List;

import com.ssafy.ssasukae.domain.room.dto.CreateRoomRequest;
import com.ssafy.ssasukae.domain.room.dto.CreateRoomResponse;
import com.ssafy.ssasukae.domain.room.dto.JoinRoomRequest;
import com.ssafy.ssasukae.domain.room.dto.JoinRoomResponse;
import com.ssafy.ssasukae.domain.room.dto.RoomParticipantResponse;
import com.ssafy.ssasukae.domain.room.dto.RoomSnapshotResponse;
import com.ssafy.ssasukae.domain.room.dto.UpdateMediaStateRequest;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomBan;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.event.ParticipantConnectionChangedDomainEvent;
import com.ssafy.ssasukae.domain.room.event.ParticipantJoinedDomainEvent;
import com.ssafy.ssasukae.domain.room.event.ParticipantKickedDomainEvent;
import com.ssafy.ssasukae.domain.room.event.ParticipantMediaStateChangedDomainEvent;
import com.ssafy.ssasukae.domain.room.event.ParticipantLeftDomainEvent;
import com.ssafy.ssasukae.domain.room.repository.RoomBanRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.ParticipantLeaveReason;
import com.ssafy.ssasukae.domain.room.type.ParticipantRole;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.global.exception.room.RoomException;
import com.ssafy.ssasukae.integration.openvidu.MediaSessionGateway;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RoomService {

  private static final int MAX_PARTICIPANTS = 4;
  private static final EnumSet<ConnectionStatus> ACTIVE_STATUSES =
      EnumSet.of(ConnectionStatus.ONLINE, ConnectionStatus.DISCONNECTED);

  private final RoomRepository roomRepository;
  private final RoomParticipantRepository roomParticipantRepository;
  private final RoomBanRepository roomBanRepository;
  private final UserRepository userRepository;
  private final RoomNamePolicy roomNamePolicy;
  private final InviteCodeGenerator inviteCodeGenerator;
  private final MediaSessionGateway mediaSessionGateway;
  private final ApplicationEventPublisher applicationEventPublisher;
  private final Clock clock;

  public RoomService(
      RoomRepository roomRepository,
      RoomParticipantRepository roomParticipantRepository,
      RoomBanRepository roomBanRepository,
      UserRepository userRepository,
      RoomNamePolicy roomNamePolicy,
      InviteCodeGenerator inviteCodeGenerator,
      MediaSessionGateway mediaSessionGateway,
      ApplicationEventPublisher applicationEventPublisher,
      Clock clock) {
    this.roomRepository = roomRepository;
    this.roomParticipantRepository = roomParticipantRepository;
    this.roomBanRepository = roomBanRepository;
    this.userRepository = userRepository;
    this.roomNamePolicy = roomNamePolicy;
    this.inviteCodeGenerator = inviteCodeGenerator;
    this.mediaSessionGateway = mediaSessionGateway;
    this.applicationEventPublisher = applicationEventPublisher;
    this.clock = clock;
  }

  @Transactional
  public CreateRoomResponse createRoom(Long userId, CreateRoomRequest request) {
    User user = findUser(userId);
    validateNoActiveRoom(userId);

    String normalizedName = roomNamePolicy.normalizeAndValidate(request.name());
    String inviteCode = inviteCodeGenerator.generate();
    String sessionId = mediaSessionGateway.createSession();
    LocalDateTime now = LocalDateTime.now(clock);

    Room room =
        roomRepository.save(
            Room.create(
                user,
                inviteCode,
                normalizedName,
                request.mode(),
                MAX_PARTICIPANTS,
                sessionId,
                now));

    RoomParticipant host = roomParticipantRepository.save(RoomParticipant.host(room, user, now));
    String mediaConnectionToken =
        mediaSessionGateway.createConnectionToken(sessionId, host.getId());

    return new CreateRoomResponse(
        room.getId(), room.getInviteCode(), room.getMode(), mediaConnectionToken);
  }

  @Transactional
  public JoinRoomResponse joinRoom(Long userId, JoinRoomRequest request) {
    User user = findUser(userId);
    String inviteCode = request.inviteCode().toUpperCase();

    Room room =
        roomRepository
            .findByInviteCodeForUpdate(inviteCode)
            .orElseThrow(RoomException::inviteCodeNotFound);

    RoomParticipant existing =
        roomParticipantRepository.findByRoom_IdAndUser_Id(room.getId(), userId).orElse(null);

    if (roomBanRepository.existsByRoom_IdAndUser_Id(room.getId(), userId)
        || (existing != null && existing.getConnectionStatus() == ConnectionStatus.KICKED)) {
      throw RoomException.reentryBanned();
    }

    if (existing == null) {
      validateNoActiveRoom(userId);
    }

    long activeCount =
        roomParticipantRepository.countByRoom_IdAndConnectionStatusIn(
            room.getId(), ACTIVE_STATUSES);

    if (existing == null || !existing.isActive()) {
      room.validateJoinable(activeCount);
    }

    LocalDateTime now = LocalDateTime.now(clock);

    if (existing != null && existing.isActive()) {
      String mediaConnectionToken =
          mediaSessionGateway.createConnectionToken(room.getOpenViduSessionId(), existing.getId());
      return new JoinRoomResponse(
          room.getId(),
          room.getName(),
          room.getMode(),
          Math.toIntExact(activeCount),
          mediaConnectionToken);
    }

    RoomParticipant participant;
    if (existing == null) {
      participant =
          roomParticipantRepository.save(RoomParticipant.participant(room, user, now));
    } else {
      existing.reconnect(now);
      participant = existing;
    }

    long version = room.increaseVersion(now);
    int participantCount =
        Math.toIntExact(
            roomParticipantRepository.countByRoom_IdAndConnectionStatusIn(
                room.getId(), ACTIVE_STATUSES));

    String mediaConnectionToken =
        mediaSessionGateway.createConnectionToken(room.getOpenViduSessionId(), participant.getId());

    applicationEventPublisher.publishEvent(
        new ParticipantJoinedDomainEvent(
            room.getId(),
            version,
            participant.getId(),
            participant.getUser().getNickname(),
            participantCount));

    return new JoinRoomResponse(
        room.getId(),
        room.getName(),
        room.getMode(),
        participantCount,
        mediaConnectionToken);
  }

  @Transactional
  public void leaveRoom(Long roomId, Long userId) {
    Room room = roomRepository.findByIdForUpdate(roomId).orElseThrow(RoomException::notFound);
    if (room.getStatus() == RoomStatus.FINISHED) {
      throw RoomException.closed();
    }

    RoomParticipant leavingParticipant =
        roomParticipantRepository
            .findByRoom_IdAndUser_Id(roomId, userId)
            .filter(RoomParticipant::isActive)
            .orElseThrow(RoomException::accessDenied);

    LocalDateTime now = LocalDateTime.now(clock);
    boolean hostLeaving = leavingParticipant.getRole() == ParticipantRole.HOST;

    leavingParticipant.leave(now);
    if (hostLeaving) {
      leavingParticipant.demoteToParticipant();
    }

    long participantLeftVersion = room.increaseVersion(now);
    Long newHostParticipantId =
        roomParticipantRepository
            .findByRoom_IdAndRole(roomId, ParticipantRole.HOST)
            .filter(RoomParticipant::isActive)
            .map(RoomParticipant::getId)
            .orElse(null);
    Long hostChangedVersion = null;

    if (hostLeaving) {
      RoomParticipant newHost = findNextOnlineHost(roomId);

      if (newHost != null) {
        newHost.promoteToHost();
        newHostParticipantId = newHost.getId();
        hostChangedVersion = room.increaseVersion(now);
      } else {
        closeRoomAndLeaveRemainingParticipants(room, now);
        newHostParticipantId = null;
      }
    }

    int participantCount =
        Math.toIntExact(
            roomParticipantRepository.countByRoom_IdAndConnectionStatusIn(
                roomId, ACTIVE_STATUSES));

    applicationEventPublisher.publishEvent(
        new ParticipantLeftDomainEvent(
            roomId,
            participantLeftVersion,
            leavingParticipant.getId(),
            participantCount,
            newHostParticipantId,
            ParticipantLeaveReason.LEFT,
            hostChangedVersion));
  }

  @Transactional
  public void kickParticipant(Long roomId, Long targetParticipantId, Long requesterUserId) {
    Room room = roomRepository.findByIdForUpdate(roomId).orElseThrow(RoomException::notFound);
    if (room.getStatus() == RoomStatus.FINISHED) {
      throw RoomException.closed();
    }

    RoomParticipant requester =
        roomParticipantRepository
            .findByRoom_IdAndUser_Id(roomId, requesterUserId)
            .filter(RoomParticipant::isActive)
            .orElseThrow(RoomException::accessDenied);
    if (requester.getRole() != ParticipantRole.HOST) {
      throw RoomException.hostPermissionRequired();
    }
    if (requester.getConnectionStatus() != ConnectionStatus.ONLINE) {
      throw RoomException.requesterNotOnline();
    }

    RoomParticipant target =
        roomParticipantRepository
            .findByIdAndRoom_Id(targetParticipantId, roomId)
            .orElseThrow(RoomException::participantNotFound);
    if (requester.getId().equals(target.getId())) {
      throw RoomException.cannotKickSelf();
    }
    if (!target.isActive()) {
      throw RoomException.participantNotActive();
    }

    LocalDateTime now = LocalDateTime.now(clock);
    target.kick(now);
    roomBanRepository.save(
        RoomBan.create(room, target.getUser(), requester.getUser(), now));

    long version = room.increaseVersion(now);
    int participantCount =
        Math.toIntExact(
            roomParticipantRepository.countByRoom_IdAndConnectionStatusIn(
                roomId, ACTIVE_STATUSES));

    applicationEventPublisher.publishEvent(
        new ParticipantKickedDomainEvent(
            roomId,
            version,
            target.getId(),
            target.getUser().getId(),
            target.getUser().getNickname(),
            requester.getUser().getId(),
            participantCount));
  }

  @Transactional
  public void updateMediaState(Long roomId, Long userId, UpdateMediaStateRequest request) {
    Room room = roomRepository.findByIdForUpdate(roomId).orElseThrow(RoomException::notFound);
    if (room.getStatus() == RoomStatus.FINISHED) {
      throw RoomException.closed();
    }

    RoomParticipant participant =
        roomParticipantRepository
            .findByRoom_IdAndUser_Id(roomId, userId)
            .filter(RoomParticipant::isActive)
            .orElseThrow(RoomException::accessDenied);

    boolean changed =
        participant.updateMediaState(request.micEnabled(), request.cameraEnabled());
    if (!changed) {
      return;
    }

    LocalDateTime now = LocalDateTime.now(clock);
    long version = room.increaseVersion(now);
    applicationEventPublisher.publishEvent(
        new ParticipantMediaStateChangedDomainEvent(
            roomId,
            version,
            participant.getId(),
            participant.isMicEnabled(),
            participant.isCameraEnabled()));
  }

  @Transactional
  public void connectRoomWebSocket(Long roomId, Long userId) {
    Room room = roomRepository.findByIdForUpdate(roomId).orElseThrow(RoomException::notFound);
    if (room.getStatus() == RoomStatus.FINISHED) {
      throw RoomException.closed();
    }

    RoomParticipant participant =
        roomParticipantRepository
            .findByRoom_IdAndUser_Id(roomId, userId)
            .filter(RoomParticipant::isActive)
            .orElseThrow(RoomException::accessDenied);

    if (participant.getConnectionStatus() == ConnectionStatus.ONLINE) {
      return;
    }
    if (participant.getConnectionStatus() != ConnectionStatus.DISCONNECTED) {
      throw RoomException.accessDenied();
    }

    LocalDateTime now = LocalDateTime.now(clock);
    participant.reconnect(now);
    long connectionChangedVersion = room.increaseVersion(now);

    Long newHostParticipantId = null;
    Long hostChangedVersion = null;
    RoomParticipant onlineHost =
        roomParticipantRepository
            .findByRoom_IdAndRole(roomId, ParticipantRole.HOST)
            .filter(host -> host.getConnectionStatus() == ConnectionStatus.ONLINE)
            .orElse(null);

    if (onlineHost == null) {
      demoteExistingHostIfNecessary(roomId, participant);
      participant.promoteToHost();
      newHostParticipantId = participant.getId();
      hostChangedVersion = room.increaseVersion(now);
    }

    publishConnectionChanged(
        room,
        participant,
        ConnectionStatus.ONLINE,
        connectionChangedVersion,
        newHostParticipantId,
        hostChangedVersion);
  }

  @Transactional
  public void disconnectRoomWebSocket(Long roomId, Long userId) {
    Room room = roomRepository.findByIdForUpdate(roomId).orElseThrow(RoomException::notFound);
    if (room.getStatus() == RoomStatus.FINISHED) {
      return;
    }

    RoomParticipant participant =
        roomParticipantRepository
            .findByRoom_IdAndUser_Id(roomId, userId)
            .filter(RoomParticipant::isActive)
            .orElse(null);

    if (participant == null || participant.getConnectionStatus() != ConnectionStatus.ONLINE) {
      return;
    }

    LocalDateTime now = LocalDateTime.now(clock);
    boolean hostDisconnected = participant.getRole() == ParticipantRole.HOST;

    participant.disconnect(now);
    if (hostDisconnected) {
      participant.demoteToParticipant();
    }

    long connectionChangedVersion = room.increaseVersion(now);
    Long newHostParticipantId = null;
    Long hostChangedVersion = null;

    if (hostDisconnected) {
      RoomParticipant newHost = findNextOnlineHost(roomId);
      if (newHost != null) {
        newHost.promoteToHost();
        newHostParticipantId = newHost.getId();
        hostChangedVersion = room.increaseVersion(now);
      }
    }

    publishConnectionChanged(
        room,
        participant,
        ConnectionStatus.DISCONNECTED,
        connectionChangedVersion,
        newHostParticipantId,
        hostChangedVersion);
  }

  @Transactional(readOnly = true)
  public RoomSnapshotResponse getRoomSnapshot(Long roomId, Long userId) {
    Room room = roomRepository.findById(roomId).orElseThrow(RoomException::notFound);
    if (room.getStatus() == RoomStatus.FINISHED) {
      throw RoomException.closed();
    }

    RoomParticipant requester =
        roomParticipantRepository
            .findByRoom_IdAndUser_Id(roomId, userId)
            .filter(RoomParticipant::isActive)
            .orElseThrow(RoomException::accessDenied);

    List<RoomParticipantResponse> participants =
        roomParticipantRepository.findAllByRoom_IdOrderByJoinedAtAsc(roomId).stream()
            .filter(RoomParticipant::isActive)
            .map(RoomParticipantResponse::from)
            .toList();

    Long hostParticipantId =
        roomParticipantRepository
            .findByRoom_IdAndRole(roomId, ParticipantRole.HOST)
            .filter(RoomParticipant::isActive)
            .map(RoomParticipant::getId)
            .orElse(requester.getRole() == ParticipantRole.HOST ? requester.getId() : null);

    return new RoomSnapshotResponse(
        room.getId(),
        room.getName(),
        room.getInviteCode(),
        room.getMode(),
        room.getStatus(),
        room.getVersion(),
        hostParticipantId,
        participants,
        null);
  }

  private RoomParticipant findNextOnlineHost(Long roomId) {
    return roomParticipantRepository
        .findFirstByRoom_IdAndConnectionStatusOrderByUser_IdAsc(
            roomId, ConnectionStatus.ONLINE)
        .orElse(null);
  }

  private void demoteExistingHostIfNecessary(
      Long roomId, RoomParticipant participantToPromote) {
    roomParticipantRepository
        .findByRoom_IdAndRole(roomId, ParticipantRole.HOST)
        .filter(existingHost -> !existingHost.getId().equals(participantToPromote.getId()))
        .ifPresent(RoomParticipant::demoteToParticipant);
  }

  private void publishConnectionChanged(
      Room room,
      RoomParticipant participant,
      ConnectionStatus connectionStatus,
      long connectionChangedVersion,
      Long newHostParticipantId,
      Long hostChangedVersion) {
    applicationEventPublisher.publishEvent(
        new ParticipantConnectionChangedDomainEvent(
            room.getId(),
            connectionChangedVersion,
            participant.getId(),
            connectionStatus,
            newHostParticipantId,
            hostChangedVersion));
  }

  private void closeRoomAndLeaveRemainingParticipants(Room room, LocalDateTime now) {
    roomParticipantRepository.findAllByRoom_IdOrderByJoinedAtAsc(room.getId()).stream()
        .filter(RoomParticipant::isActive)
        .forEach(
            participant -> {
              participant.leave(now);
              participant.demoteToParticipant();
            });
    room.finish(now);
    mediaSessionGateway.closeSession(room.getOpenViduSessionId());
  }

  private User findUser(Long userId) {
    return userRepository
        .findById(userId)
        .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 사용자입니다."));
  }

  private void validateNoActiveRoom(Long userId) {
    if (roomParticipantRepository.existsByUser_IdAndConnectionStatusIn(userId, ACTIVE_STATUSES)) {
      throw RoomException.alreadyInActiveRoom();
    }
  }
}
