package com.ssafy.ssasukae.domain.room.service;

import com.ssafy.ssasukae.domain.card.service.CardService;
import com.ssafy.ssasukae.domain.performance.redis.leaderboard.RoomLeaderboardEntry;
import com.ssafy.ssasukae.domain.performance.redis.leaderboard.RoomLeaderboardStore;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.type.PerformanceCancelReason;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.service.PerformanceRecoveryService;
import com.ssafy.ssasukae.domain.room.dto.*;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketEventType;
import com.ssafy.ssasukae.domain.room.websocket.payload.*;
import com.ssafy.ssasukae.domain.room.websocket.request.HostChangeRequest;
import com.ssafy.ssasukae.domain.room.websocket.request.ParticipantChatRequest;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.room.RoomErrorCode;
import com.ssafy.ssasukae.global.exception.user.UserErrorCode;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketErrorCode;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketException;
import com.ssafy.ssasukae.global.websocket.message.WebSocketEvent;
import com.ssafy.ssasukae.global.websocket.publisher.WebSocketEventPublisher;
import com.ssafy.ssasukae.integration.openvidu.MediaSessionGateway;
import com.ssafy.ssasukae.integration.aws.S3StorageService;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.security.Principal;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;

import static com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketEventType.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RoomService {

    private static final int INVITE_CODE_LENGTH = 6;
    private static final String INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int INVITE_CODE_MAX_RETRY = 20;

    private static final List<ConnectionStatus> ACTIVE_STATUSES = List.of(
            ConnectionStatus.PREPARING,
            ConnectionStatus.CONNECTED,
            ConnectionStatus.DISCONNECTED
    );

    private final RoomRepository roomRepository;
    private final RoomParticipantRepository roomParticipantRepository;
    private final UserRepository userRepository;
    private final MediaSessionGateway mediaSessionGateway;
    private final PerformanceRecoveryService performanceRecoveryService;
    private final SecureRandom secureRandom = new SecureRandom();
    private final WebSocketEventPublisher webSocketEventPublisher;
    private final CardService cardService;
    private final PerformanceStore performanceStore;
    private final RoomLeaderboardStore roomLeaderboardStore;
    private final Clock clock;
    private final SongRepository songRepository;
    private final S3StorageService s3StorageService;

    @Transactional
    public RoomCreateResponse createRoom(Long hostUserId, RoomCreateRequest request) {
        User host = getUser(hostUserId);
        validateNoActiveRoom(host.getId());

        String inviteCode = generateInviteCode();
        String openViduSessionId = mediaSessionGateway.createSession();
        LocalDateTime now = LocalDateTime.now();

        Room room = Room.create(
                inviteCode,
                request.name(),
                request.mode(),
                host,
                openViduSessionId,
                now
        );

        Room savedRoom = roomRepository.save(room);

        RoomParticipant hostParticipant = RoomParticipant.join(savedRoom, host, now);
        RoomParticipant savedParticipant = roomParticipantRepository.save(hostParticipant);

        String token = mediaSessionGateway.createConnectionToken(
                savedRoom.getOpenViduSessionId(),
                savedParticipant.getId()
        );

        return new RoomCreateResponse(
                savedRoom.getId(),
                savedParticipant.getId(),
                savedRoom.getInviteCode(),
                savedRoom.getOpenViduSessionId(),
                token
        );
    }

    @Transactional
    public RoomJoinResponse joinRoom(Long userId, String inviteCode) {
        User user = getUser(userId);

        Room room = roomRepository.findByInviteCodeForUpdate(inviteCode.toUpperCase())
                .orElseThrow(() -> new CustomException(RoomErrorCode.ROOM_NOT_FOUND));

        validateNotKicked(room.getId(), user.getId());

        if (roomParticipantRepository.existsByRoomIdAndUserIdAndConnectionStatusIn(
                room.getId(),
                user.getId(),
                ACTIVE_STATUSES
        )) {
            throw new CustomException(RoomErrorCode.ALREADY_JOINED);
        }

        validateNoActiveRoom(user.getId());

        long activeParticipantCount = roomParticipantRepository.countByRoomIdAndConnectionStatusIn(
                room.getId(),
                ACTIVE_STATUSES
        );

        room.validateJoinable(activeParticipantCount);

        RoomParticipant participant = RoomParticipant.join(room, user, LocalDateTime.now());
        RoomParticipant savedParticipant = roomParticipantRepository.save(participant);

        String token = mediaSessionGateway.createConnectionToken(
                room.getOpenViduSessionId(),
                savedParticipant.getId()
        );

        return new RoomJoinResponse(
                room.getId(),
                savedParticipant.getId(),
                room.getInviteCode(),
                room.getOpenViduSessionId(),
                token,
                room.getMode()
        );
    }

    public RoomSnapshotResponse getRoomSnapshot(Long userId, Long roomId) {
        validateNotKicked(roomId, userId);

        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.ROOM_NOT_FOUND));

        RoomParticipant requester =
                roomParticipantRepository.findByRoomIdAndUserId(roomId, userId)
                        .orElseThrow(() -> new CustomException(RoomErrorCode.PARTICIPANT_NOT_FOUND));

        if (!requester.isActive()) {
            throw new CustomException(RoomErrorCode.PARTICIPANT_NOT_ACTIVE);
        }

        List<RoomParticipant> activeParticipants =
                roomParticipantRepository.findAllByRoomIdAndConnectionStatusInOrderByJoinedAtAsc(
                        roomId,
                        ACTIVE_STATUSES
                );

        OffsetDateTime serverNow = clock == null
                ? OffsetDateTime.now()
                : OffsetDateTime.now(clock)
                        .atZoneSameInstant(ZoneId.of("Asia/Seoul"))
                        .toOffsetDateTime();
        PerformanceSnapShot performance = performanceStore == null
                ? null
                : performanceStore.findActiveByRoomId(roomId).orElse(null);
        PerformanceSnapshotResponse performanceResponse = performance == null
                ? null
                : createPerformanceSnapshot(performance, serverNow);
        PlaybackSnapshotResponse playback = performance == null
                ? null
                : PlaybackSnapshotResponse.from(performance, serverNow);
        MyCardSnapshotResponse myCard =
                performance == null || cardService == null
                        ? null
                        : cardService
                                .findAssignment(
                                        roomId, performance.performanceId(), requester.getId())
                                .map(MyCardSnapshotResponse::from)
                                .orElse(null);
        List<CardUsageStatusResponse> cardUsageStatuses =
                performance == null || cardService == null
                        ? List.of()
                        : cardService.findAssignments(roomId, performance.performanceId()).stream()
                                .map(CardUsageStatusResponse::from)
                                .toList();
        ActiveCardSnapshotResponse activeCard = performance == null || cardService == null
                ? null
                : cardService
                        .findActiveCard(roomId)
                        .filter(card -> performance.performanceId().equals(card.performanceId()))
                        .flatMap(
                                card ->
                                        cardService
                                                .findAssignment(
                                                        roomId,
                                                        performance.performanceId(),
                                                        card.sourceParticipantId())
                                                .map(
                                                        assignment ->
                                                                ActiveCardSnapshotResponse.from(
                                                                        card, assignment)))
                        .orElse(null);
        List<RoomLeaderboardEntry> rankedEntries = roomLeaderboardStore.findAllRanked(roomId);
        List<LeaderboardSnapshotResponse> leaderboard = java.util.stream.IntStream
                .range(0, rankedEntries.size())
                .mapToObj(index -> LeaderboardSnapshotResponse.from(rankedEntries.get(index), index + 1))
                .toList();

        return RoomSnapshotResponse.from(
                room,
                activeParticipants,
                serverNow,
                performanceResponse,
                playback,
                leaderboard,
                myCard,
                cardUsageStatuses,
                activeCard);
    }

    @Transactional
    public RoomInviteResponse getRoomByInviteCode(String inviteCode) {
        Room room = roomRepository.findByInviteCode(inviteCode.toUpperCase())
                .orElseThrow(() -> new CustomException(RoomErrorCode.ROOM_NOT_FOUND));

        long currentParticipants =
                roomParticipantRepository.countByRoomIdAndConnectionStatusIn(
                        room.getId(),
                        ACTIVE_STATUSES
                );

        boolean joinable =
                room.getStatus() == RoomStatus.PREPARING
                        && currentParticipants < room.getMaxParticipants();

        return new RoomInviteResponse(
                room.getId(),
                room.getInviteCode(),
                room.getName(),
                room.getMode(),
                room.getStatus(),
                currentParticipants,
                room.getMaxParticipants(),
                joinable
        );
    }

    private PerformanceSnapshotResponse createPerformanceSnapshot(
            PerformanceSnapShot performance,
            OffsetDateTime serverNow) {
        Song song = songRepository.findById(performance.songId())
                .orElseThrow(() -> new CustomException(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED));
        return PerformanceSnapshotResponse.from(
                performance,
                song,
                serverNow,
                s3StorageService.presignedUrl(song.getMrObjectKey()),
                s3StorageService.presignedUrl(song.getMidiObjectKey()),
                s3StorageService.presignedUrl(song.getLyricsObjectKey())
        );
    }

    @Transactional
    public String issueConnectionToken(Long userId, Long roomId) {
        validateNotKicked(roomId, userId);

        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.ROOM_NOT_FOUND));

        RoomParticipant participantCandidate = roomParticipantRepository.findByRoomIdAndUserId(roomId, userId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.PARTICIPANT_NOT_FOUND));
        RoomParticipant participant = roomParticipantRepository.findByIdForUpdate(participantCandidate.getId())
                .orElseThrow(() -> new CustomException(RoomErrorCode.PARTICIPANT_NOT_FOUND));

        if (!participant.isActive()) {
            throw new CustomException(RoomErrorCode.PARTICIPANT_NOT_ACTIVE);
        }

        // 새로고침 및 재접속 시 OpenVidu가 participantEvicted를 브로드캐스트하며 클라이언트 SDK가 경쟁상태로 터지는 것을 막기 위해, 새 토큰 발급 전에 기존 연결을 정리한다.
        disconnectStaleMediaConnection(room, participant);

        return mediaSessionGateway.createConnectionToken(
                room.getOpenViduSessionId(),
                participant.getId()
        );
    }

    private void disconnectStaleMediaConnection(Room room, RoomParticipant participant) {
        if (participant.getConnectionStatus() != ConnectionStatus.CONNECTED
                && participant.getConnectionStatus() != ConnectionStatus.DISCONNECTED) {
            return;
        }

        // OpenVidu에 connection 이 이미 없으면 무시하고 새 토큰을 발급한다.
        releaseMediaConnection(room.getOpenViduSessionId(), participant.getConnectionId());
    }

    /**
     * OpenVidu 커넥션을 해제한다. 커넥션이 없거나 이미 정리된 경우는 정상 상황으로 보고 넘어간다.
     *
     * <p>LOW_LATENCY 방은 네이티브 앱이 프레즌스 연결을 대신하므로 참가자가 CONNECTED 이면서도
     * connectionId 가 null 이다({@code LowLatencyAppService#createAppSession}). 이 메서드는
     * afterCommit 콜백에서 호출되기 때문에, 여기서 예외가 나가면 트랜잭션은 이미 커밋된 채로
     * 요청이 500 이 되고 뒤따르는 WebSocket 이벤트 발행까지 건너뛰게 된다. 그래서 미디어 해제
     * 실패가 퇴장/강퇴 브로드캐스트를 막지 않도록 여기서 삼킨다.
     */
    private void releaseMediaConnection(String openViduSessionId, String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }

        try {
            mediaSessionGateway.disconnect(openViduSessionId, connectionId);
        } catch (CustomException ignored) {
        }
    }

    @Transactional
    public void terminateRoom(Long userId, Long roomId) {
        Room room = roomRepository.findByIdForUpdate(roomId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.ROOM_NOT_FOUND));

        if (!room.isHost(userId)) {
            throw new CustomException(RoomErrorCode.HOST_ONLY);
        }

        terminateLockedRoom(room);
    }

    private void terminateLockedRoom(Room room) {
        Long roomId = room.getId();
        LocalDateTime now = LocalDateTime.now();
        room.terminate(now);
        if (cardService != null) {
            cardService.closeRoom(roomId);
        }

        List<RoomParticipant> activeParticipants =
                roomParticipantRepository.findAllByRoomIdAndConnectionStatusIn(roomId, ACTIVE_STATUSES);
        activeParticipants.forEach(participant -> participant.leave(now));

        afterCommit(() -> {
            mediaSessionGateway.closeSession(room.getOpenViduSessionId());
            webSocketEventPublisher.publishToRoom(roomId, WebSocketEvent.roomEvent(ROOM_TERMINATED, roomId, new RoomTerminatedPayload(now)));
        });
    }

    @Transactional
    public void leaveRoom(Long userId, Long roomId) {
        Room currentRoom = roomRepository.findByIdForUpdate(roomId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.ROOM_NOT_FOUND));

        RoomParticipant participantCandidate = roomParticipantRepository.findByRoomIdAndUserId(roomId, userId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.PARTICIPANT_NOT_FOUND));
        RoomParticipant participant = roomParticipantRepository.findByIdForUpdate(participantCandidate.getId())
                .orElseThrow(() -> new CustomException(RoomErrorCode.PARTICIPANT_NOT_FOUND));

        if (!participant.isActive()) {
            throw new CustomException(RoomErrorCode.PARTICIPANT_NOT_ACTIVE);
        }

        leaveParticipant(currentRoom, participant, PerformanceCancelReason.PERFORMER_REQUEST);
    }

    @Transactional
    public void leaveByConnectionExpiration(Long participantId) {
        RoomParticipant participantCandidate = roomParticipantRepository.findById(participantId).orElse(null);
        if(participantCandidate == null) return;

        Room currentRoom = roomRepository.findByIdForUpdate(participantCandidate.getRoom().getId())
                .orElse(null);
        if(currentRoom == null) return;

        RoomParticipant participant = roomParticipantRepository.findByIdForUpdate(participantId)
                .orElse(null);
        if(participant == null
                || participant.getConnectionStatus() != ConnectionStatus.DISCONNECTED) return;

        leaveParticipant(currentRoom, participant, PerformanceCancelReason.PERFORMER_DISCONNECTED);
    }

    private void leaveParticipant(
            Room currentRoom,
            RoomParticipant participant,
            PerformanceCancelReason performanceCancelReason) {
        Long roomId = currentRoom.getId();
        Long userId = participant.getUser().getId();
        performanceRecoveryService.recoverPerformerExitCaseWithLockedRoom(
                currentRoom,
                userId,
                performanceCancelReason);

        RoomParticipant newHost = null;
        if(currentRoom.isHost(userId)) {
            List<RoomParticipant> participants = roomParticipantRepository.findRoomParticipantsByRoom(currentRoom);
            newHost = participants
                    .stream()
                    .filter(RoomParticipant::isActive)
                    .filter(p ->
                            !p.getUser().getId().equals(userId)
                    )
                    .min(Comparator
                            .comparing(RoomParticipant::getJoinedAt)
                            .thenComparing(RoomParticipant::getId))
                    .orElse(null);

            if(newHost == null) {
                terminateLockedRoom(currentRoom);
                participant.leave(LocalDateTime.now());
                afterCommit(() -> webSocketEventPublisher.publishToRoom(roomId, WebSocketEvent.roomEvent(PARTICIPANT_LEFT, roomId, new ParticipantLeftPayload(participant.getId()))));
                return;
            }

            currentRoom.delegateHost(newHost.getUser());
        }

        boolean online = participant.isOnline();
        String connectionId = participant.getConnectionId();

        participant.leave(LocalDateTime.now());

        RoomParticipant changedHost = newHost;
        afterCommit(() -> {
            if (online) releaseMediaConnection(currentRoom.getOpenViduSessionId(), connectionId);
            if(changedHost != null) webSocketEventPublisher.publishToRoom(roomId, WebSocketEvent.roomEvent(ROOM_HOST_CHANGED, roomId, new RoomHostChangedPayload(changedHost.getId())));
            webSocketEventPublisher.publishToRoom(roomId, WebSocketEvent.roomEvent(PARTICIPANT_LEFT, roomId, new ParticipantLeftPayload(participant.getId())));
        });
    }

    private User getUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new CustomException(UserErrorCode.USER_NOT_FOUND));
    }

    private void validateNoActiveRoom(Long userId) {
        if (roomParticipantRepository.existsByUserIdAndConnectionStatusIn(userId, ACTIVE_STATUSES)) {
            throw new CustomException(RoomErrorCode.ALREADY_IN_ANOTHER_ROOM);
        }
    }

    private void validateNotKicked(Long roomId, Long userId) {
        if (roomParticipantRepository.existsByRoomIdAndUserIdAndConnectionStatus(
                roomId,
                userId,
                ConnectionStatus.KICKED
        )) {
            throw new CustomException(RoomErrorCode.REENTRY_BANNED);
        }
    }

    private String generateInviteCode() {
        for (int i = 0; i < INVITE_CODE_MAX_RETRY; i++) {
            String inviteCode = randomInviteCode();

            if (!roomRepository.existsByInviteCode(inviteCode)) {
                return inviteCode;
            }
        }

        throw new CustomException(RoomErrorCode.INVITE_CODE_GENERATION_FAILED);
    }

    private String randomInviteCode() {
        StringBuilder builder = new StringBuilder(INVITE_CODE_LENGTH);

        for (int i = 0; i < INVITE_CODE_LENGTH; i++) {
            int index = secureRandom.nextInt(INVITE_CODE_CHARS.length());
            builder.append(INVITE_CODE_CHARS.charAt(index));
        }

        return builder.toString();
    }

    @Transactional
    public void chat(Long roomId, ParticipantChatRequest request, Principal principal) {
        User user = getUser(Long.valueOf(principal.getName()));
        Room room = roomRepository.findById(roomId).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.RESOURCE_NOT_FOUND));
        if(room.getStatus() == RoomStatus.TERMINATED) throw new WebSocketException(WebSocketErrorCode.INVALID_ROOM_STATE);
        RoomParticipant sender = roomParticipantRepository.findByRoomIdAndUserId(room.getId(), user.getId()).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.ROOM_ACCESS_DENIED));
        if(!sender.isActive()) throw new WebSocketException(WebSocketErrorCode.ACTION_NOT_ALLOWED);

        webSocketEventPublisher.publishToRoom(room.getId(), WebSocketEvent.roomEvent(PARTICIPANT_CHAT, room.getId(), new RoomParticipantChatPayload(sender.getId(), request.message().trim(), LocalDateTime.now())));
    }

    @Transactional
    public void hostChange(Long roomId, HostChangeRequest request, Principal principal) {
        User user = getUser(Long.valueOf(principal.getName()));
        Room room = roomRepository.findByIdForUpdate(roomId).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.RESOURCE_NOT_FOUND));
        if(room.getStatus() == RoomStatus.TERMINATED) throw new WebSocketException(WebSocketErrorCode.INVALID_ROOM_STATE);
        if(!room.isHost(user.getId())) throw new WebSocketException(WebSocketErrorCode.ACTION_NOT_ALLOWED);
        RoomParticipant senderCandidate = roomParticipantRepository.findByRoomIdAndUserId(room.getId(), user.getId()).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.ROOM_ACCESS_DENIED));
        RoomParticipant sender = roomParticipantRepository.findByIdForUpdate(senderCandidate.getId()).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.ROOM_ACCESS_DENIED));
        if(!sender.isActive()) throw new WebSocketException(WebSocketErrorCode.ACTION_NOT_ALLOWED);
        RoomParticipant receiver = roomParticipantRepository.findByIdForUpdate(request.participantId()).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.RESOURCE_NOT_FOUND));
        if(!receiver.isActive()) throw new WebSocketException(WebSocketErrorCode.INVALID_ROOM_STATE);

        room.delegateHost(receiver.getUser());
        afterCommit(() -> webSocketEventPublisher.publishToRoom(room.getId(), WebSocketEvent.roomEvent(ROOM_HOST_CHANGED, room.getId(), new RoomHostChangedPayload(receiver.getId()))));
    }

    @Transactional
    public void kickParticipant(Long roomId, Long participantId, Long userId) {
        User user = getUser(userId);
        Room room = roomRepository.findByIdForUpdate(roomId).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.RESOURCE_NOT_FOUND));
        if(room.getStatus() == RoomStatus.TERMINATED) throw new WebSocketException(WebSocketErrorCode.INVALID_ROOM_STATE);
        if(!room.isHost(user.getId())) throw new WebSocketException(WebSocketErrorCode.ACTION_NOT_ALLOWED);
        RoomParticipant senderCandidate = roomParticipantRepository.findByRoomIdAndUserId(room.getId(), user.getId()).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.ROOM_ACCESS_DENIED));
        RoomParticipant sender = roomParticipantRepository.findByIdForUpdate(senderCandidate.getId()).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.ROOM_ACCESS_DENIED));
        if(!sender.isActive()) throw new WebSocketException(WebSocketErrorCode.ACTION_NOT_ALLOWED);
        RoomParticipant receiver = roomParticipantRepository.findByIdForUpdate(participantId).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.RESOURCE_NOT_FOUND));
        if(!receiver.isActive()) throw new WebSocketException(WebSocketErrorCode.INVALID_ROOM_STATE);

        boolean online = receiver.isOnline();
        String connectionId = receiver.getConnectionId();
        receiver.kick(LocalDateTime.now());
        performanceRecoveryService.recoverPerformerExitCaseWithLockedRoom(
                room,
                receiver.getUser().getId(),
                PerformanceCancelReason.SAFETY_TERMINATION);
        afterCommit(() -> {
            if (online) releaseMediaConnection(room.getOpenViduSessionId(), connectionId);
            webSocketEventPublisher.publishToRoom(room.getId(), WebSocketEvent.roomEvent(PARTICIPANT_KICKED, room.getId(), new ParticipantKickedPayload(participantId)));
        });
    }
    @Transactional
    public void selectPerformer(Long hostUserId, Long roomId, Long performerParticipantId) {
        Room room = roomRepository.findByIdForUpdate(roomId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.ROOM_NOT_FOUND));

        if (!room.isHost(hostUserId)) {
            throw new CustomException(RoomErrorCode.HOST_ONLY);
        }

        if (room.getStatus() != RoomStatus.PREPARING) {
            throw new CustomException(RoomErrorCode.ROOM_NOT_READY_FOR_PERFORMANCE);
        }

        RoomParticipant performer = roomParticipantRepository.findByIdForUpdate(performerParticipantId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.PARTICIPANT_NOT_FOUND));

        if (!performer.getRoom().getId().equals(roomId)) {
            throw new CustomException(RoomErrorCode.PARTICIPANT_NOT_FOUND);
        }

        if (!performer.isOnline()) {
            throw new CustomException(RoomErrorCode.PARTICIPANT_MUST_BE_ONLINE);
        }

        roomParticipantRepository.findRoomParticipantsByRoom(room).stream()
                .filter(RoomParticipant::isActive)
                .forEach(RoomParticipant::demoteToParticipant);

        performer.promoteToPerformer();

        afterCommit(
                () -> webSocketEventPublisher.publishToRoom(
                        roomId,
                        WebSocketEvent.roomEvent(
                                RoomWebSocketEventType.PERFORMER_SELECTED,
                                roomId,
                                new PerformerSelectedPayload(performer.getId())
                        )
                )
        );
    }

    private void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        action.run();
                    }
                }
        );
    }
}
