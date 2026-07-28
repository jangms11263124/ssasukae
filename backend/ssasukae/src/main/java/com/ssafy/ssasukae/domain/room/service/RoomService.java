package com.ssafy.ssasukae.domain.room.service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ssafy.ssasukae.domain.room.dto.RoomCreateRequest;
import com.ssafy.ssasukae.domain.room.dto.RoomCreateResponse;
import com.ssafy.ssasukae.domain.room.dto.RoomJoinResponse;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.global.exception.restapi.room.RoomException;
import com.ssafy.ssasukae.integration.openvidu.MediaSessionGateway;

import lombok.RequiredArgsConstructor;

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
    private final SecureRandom secureRandom = new SecureRandom();

    @Transactional
    public RoomCreateResponse createRoom(Long hostUserId, RoomCreateRequest request) {
        User host = getUser(hostUserId);

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

        Room room = roomRepository.findByInviteCode(inviteCode)
                .orElseThrow(RoomException::notFound);

        if (roomParticipantRepository.existsByRoomIdAndUserIdAndConnectionStatusIn(
                room.getId(),
                user.getId(),
                ACTIVE_STATUSES
        )) {
            throw RoomException.alreadyJoined();
        }

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
                token
        );
    }

    @Transactional
    public String issueConnectionToken(Long userId, Long roomId) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(RoomException::notFound);

        RoomParticipant participant = roomParticipantRepository.findByRoomIdAndUserId(roomId, userId)
                .orElseThrow(RoomException::participantNotFound);

        if (!participant.isActive()) {
            throw RoomException.participantNotActive();
        }

        return mediaSessionGateway.createConnectionToken(
                room.getOpenViduSessionId(),
                participant.getId()
        );
    }

    @Transactional
    public void terminateRoom(Long userId, Long roomId) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(RoomException::notFound);

        if (!room.isHost(userId)) {
            throw RoomException.hostOnly();
        }

        room.terminate(LocalDateTime.now());
        mediaSessionGateway.closeSession(room.getOpenViduSessionId());
    }

    private User getUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 사용자입니다. id=" + userId));
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
}