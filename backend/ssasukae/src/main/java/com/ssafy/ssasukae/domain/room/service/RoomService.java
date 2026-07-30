package com.ssafy.ssasukae.domain.room.service;

import java.security.Principal;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketEventType;
import com.ssafy.ssasukae.domain.room.websocket.payload.*;
import com.ssafy.ssasukae.domain.room.websocket.request.HostChangeRequest;
import com.ssafy.ssasukae.domain.room.websocket.request.ParticipantChatRequest;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketErrorCode;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketException;
import com.ssafy.ssasukae.global.websocket.message.WebSocketEvent;
import com.ssafy.ssasukae.global.websocket.message.WebSocketEventType;
import com.ssafy.ssasukae.global.websocket.publisher.WebSocketEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ssafy.ssasukae.domain.performance.service.PerformanceRecoveryService;
import com.ssafy.ssasukae.domain.room.dto.RoomCreateRequest;
import com.ssafy.ssasukae.domain.room.dto.RoomCreateResponse;
import com.ssafy.ssasukae.domain.room.dto.RoomJoinResponse;
import com.ssafy.ssasukae.domain.room.dto.RoomSnapshotResponse;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.room.RoomErrorCode;
import com.ssafy.ssasukae.integration.openvidu.MediaSessionGateway;

import lombok.RequiredArgsConstructor;

import static com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketEventType.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RoomService {

    private static final int INVITE_CODE_LENGTH = 6;
    private static final String INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int INVITE_CODE_MAX_RETRY = 20;

    private static final List<ConnectionStatus> ACTIVE_STATUSES = List.of(
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

        Room room = roomRepository.findByInviteCode(inviteCode.toUpperCase())
                .orElseThrow(() -> new CustomException(RoomErrorCode.ROOM_NOT_FOUND));

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

        webSocketEventPublisher.publishToRoom(room.getId(), WebSocketEvent.roomEvent(PARTICIPANT_JOINED, room.getId(), new ParticipantJoinedPayload(savedParticipant.getId(), user.getNickname())));

        return new RoomJoinResponse(
                room.getId(),
                savedParticipant.getId(),
                room.getInviteCode(),
                room.getOpenViduSessionId(),
                token
        );
    }

    public RoomSnapshotResponse getRoomSnapshot(Long userId, Long roomId) {
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

        return RoomSnapshotResponse.from(room, activeParticipants);
    }

    @Transactional
    public String issueConnectionToken(Long userId, Long roomId) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.ROOM_NOT_FOUND));

        RoomParticipant participant = roomParticipantRepository.findByRoomIdAndUserId(roomId, userId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.PARTICIPANT_NOT_FOUND));

        if (!participant.isActive()) {
            throw new CustomException(RoomErrorCode.PARTICIPANT_NOT_ACTIVE);
        }

        return mediaSessionGateway.createConnectionToken(
                room.getOpenViduSessionId(),
                participant.getId()
        );
    }

    @Transactional
    public void terminateRoom(Long userId, Long roomId) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.ROOM_NOT_FOUND));

        if (!room.isHost(userId)) {
            throw new CustomException(RoomErrorCode.HOST_ONLY);
        }

        LocalDateTime now = LocalDateTime.now();
        room.terminate(now);

        List<RoomParticipant> activeParticipants =
                roomParticipantRepository.findAllByRoomIdAndConnectionStatusIn(roomId, ACTIVE_STATUSES);
        activeParticipants.forEach(participant -> participant.leave(now));

        mediaSessionGateway.closeSession(room.getOpenViduSessionId());
        webSocketEventPublisher.publishToRoom(roomId, WebSocketEvent.roomEvent(ROOM_TERMINATED, roomId, new RoomTerminatedPayload(LocalDateTime.now())));
    }

    @Transactional
    public void leaveRoom(Long userId, Long roomId) {
        Room currentRoom = roomRepository.findById(roomId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.ROOM_NOT_FOUND));

        RoomParticipant participant = roomParticipantRepository.findByRoomIdAndUserId(roomId, userId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.PARTICIPANT_NOT_FOUND));

        if (!participant.isActive()) {
            throw new CustomException(RoomErrorCode.PARTICIPANT_NOT_ACTIVE);
        }

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
                terminateRoom(userId, roomId);
                participant.leave(LocalDateTime.now());
                webSocketEventPublisher.publishToRoom(roomId, WebSocketEvent.roomEvent(PARTICIPANT_LEFT, roomId, new ParticipantLeftPayload(participant.getId())));
                return;
            }

            currentRoom.delegateHost(newHost.getUser());
        }

        participant.leave(LocalDateTime.now());
        performanceRecoveryService.recoverPerformerExitCase(roomId, userId);

        if(newHost != null) webSocketEventPublisher.publishToRoom(roomId, WebSocketEvent.roomEvent(ROOM_HOST_CHANGED, roomId, new RoomHostChangedPayload(newHost.getId())));
        webSocketEventPublisher.publishToRoom(roomId, WebSocketEvent.roomEvent(PARTICIPANT_LEFT, roomId, new ParticipantLeftPayload(participant.getId())));
    }

    private User getUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 사용자입니다. id=" + userId));
    }

    private void validateNoActiveRoom(Long userId) {
        if (roomParticipantRepository.existsByUserIdAndConnectionStatusIn(userId, ACTIVE_STATUSES)) {
            throw new CustomException(RoomErrorCode.ALREADY_IN_ANOTHER_ROOM);
        }
    }

    private String generateInviteCode() {
        for (int i = 0; i < INVITE_CODE_MAX_RETRY; i++) {
            String inviteCode = randomInviteCode();

            if (!roomRepository.existsByInviteCode(inviteCode)) {
                return inviteCode;
            }
        }

        throw new IllegalStateException("초대 코드를 생성하지 못했습니다.");
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
        Room room = roomRepository.findById(roomId).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.RESOURCE_NOT_FOUND));
        if(room.getStatus() == RoomStatus.TERMINATED) throw new WebSocketException(WebSocketErrorCode.INVALID_ROOM_STATE);
        if(!room.isHost(user.getId())) throw new WebSocketException(WebSocketErrorCode.ACTION_NOT_ALLOWED);
        RoomParticipant sender = roomParticipantRepository.findByRoomIdAndUserId(room.getId(), user.getId()).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.ROOM_ACCESS_DENIED));
        if(!sender.isActive()) throw new WebSocketException(WebSocketErrorCode.ACTION_NOT_ALLOWED);
        RoomParticipant receiver = roomParticipantRepository.findById(request.participantId()).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.RESOURCE_NOT_FOUND));
        if(!receiver.isActive()) throw new WebSocketException(WebSocketErrorCode.INVALID_ROOM_STATE);

        room.delegateHost(receiver.getUser());
        webSocketEventPublisher.publishToRoom(room.getId(), WebSocketEvent.roomEvent(ROOM_HOST_CHANGED, room.getId(), new RoomHostChangedPayload(receiver.getId())));
    }

    @Transactional
    public void kickParticipant(Long roomId, Long participantId, Long userId) {
        User user = getUser(userId);
        Room room = roomRepository.findById(roomId).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.RESOURCE_NOT_FOUND));
        if(room.getStatus() == RoomStatus.TERMINATED) throw new WebSocketException(WebSocketErrorCode.INVALID_ROOM_STATE);
        if(!room.isHost(user.getId())) throw new WebSocketException(WebSocketErrorCode.ACTION_NOT_ALLOWED);
        RoomParticipant sender = roomParticipantRepository.findByRoomIdAndUserId(room.getId(), user.getId()).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.ROOM_ACCESS_DENIED));
        if(!sender.isActive()) throw new WebSocketException(WebSocketErrorCode.ACTION_NOT_ALLOWED);
        RoomParticipant receiver = roomParticipantRepository.findById(participantId).orElseThrow(() -> new WebSocketException(WebSocketErrorCode.RESOURCE_NOT_FOUND));
        if(!receiver.isActive()) throw new WebSocketException(WebSocketErrorCode.INVALID_ROOM_STATE);

        receiver.kick(LocalDateTime.now());
        webSocketEventPublisher.publishToRoom(room.getId(), WebSocketEvent.roomEvent(PARTICIPANT_KICKED, room.getId(), new ParticipantKickedPayload(participantId)));
    }
}
