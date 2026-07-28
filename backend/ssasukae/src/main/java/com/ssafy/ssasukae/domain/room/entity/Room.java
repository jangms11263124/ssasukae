package com.ssafy.ssasukae.domain.room.entity;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.user.entity.User;

import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.room.RoomErrorCode;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import lombok.Getter;

@Getter
@Entity
@Table(name = "rooms")
public class Room {

    public static final int MAX_PARTICIPANTS = 4;

    protected Room() {}

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "room_id")
    private Long id;

    @Column(name = "invite_code", nullable = false, unique = true, length = 6)
    private String inviteCode;

    @Column(nullable = false, length = 20)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RoomMode mode;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "host_user_id", nullable = false)
    private User host;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RoomStatus status;

    @Column(name = "max_participants", nullable = false)
    private int maxParticipants;

    @Column(name = "openvidu_session_id", nullable = false, length = 255)
    private String openViduSessionId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "terminated_at")
    private LocalDateTime terminatedAt;

    private Room(
            String inviteCode,
            String name,
            RoomMode mode,
            User host,
            String openViduSessionId,
            LocalDateTime now) {
        this.inviteCode = inviteCode;
        this.name = name;
        this.mode = mode;
        this.host = host;
        this.status = RoomStatus.PREPARING;
        this.maxParticipants = MAX_PARTICIPANTS;
        this.openViduSessionId = openViduSessionId;
        this.createdAt = now;
    }

    public static Room create(
            String inviteCode,
            String name,
            RoomMode mode,
            User host,
            String openViduSessionId,
            LocalDateTime now) {
        return new Room(inviteCode, name, mode, host, openViduSessionId, now);
    }

    public void validateJoinable(long activeParticipantCount) {
        if (status == RoomStatus.TERMINATED) {
            throw new CustomException(RoomErrorCode.ROOM_CLOSED);
        }
        if (status != RoomStatus.PREPARING) {
            throw new CustomException(RoomErrorCode.ROOM_NOT_JOINABLE);
        }
        if (activeParticipantCount >= maxParticipants) {
            throw new CustomException(RoomErrorCode.ROOM_FULL);
        }
    }

    public void startPerformance() {
        if (status == RoomStatus.TERMINATED) {
            throw new CustomException(RoomErrorCode.ROOM_CLOSED);
        }
        if (status != RoomStatus.PREPARING) {
            throw new CustomException(RoomErrorCode.ROOM_NOT_READY_FOR_PERFORMANCE);
        }
        status = RoomStatus.PLAYING;
    }

    public void cancelPerformance() {
        if (status == RoomStatus.TERMINATED) {
            throw new CustomException(RoomErrorCode.ROOM_CLOSED);
        }
        if (status != RoomStatus.PLAYING) {
            throw new CustomException(RoomErrorCode.ROOM_NOT_PLAYING);
        }
        status = RoomStatus.PREPARING;
    }

    public void delegateHost(User newHost) {
        if (status == RoomStatus.TERMINATED) {
            throw new CustomException(RoomErrorCode.ROOM_CLOSED);
        }
        this.host = newHost;
    }

    public void terminate(LocalDateTime now) {
        if (status == RoomStatus.TERMINATED) return;
        status = RoomStatus.TERMINATED;
        terminatedAt = now;
    }

    public boolean isHost(Long userId) {
        return host.getId().equals(userId);
    }
}
