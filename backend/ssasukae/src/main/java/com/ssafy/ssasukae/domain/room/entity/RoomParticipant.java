package com.ssafy.ssasukae.domain.room.entity;

import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.ParticipantRole;
import com.ssafy.ssasukae.domain.user.entity.User;

import com.ssafy.ssasukae.global.exception.room.RoomException;
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

import java.time.LocalDateTime;

@Getter
@Entity
@Table(name = "room_participants")
public class RoomParticipant {

    protected RoomParticipant() {}

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "participant_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private Room room;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "stage_role", nullable = false, length = 20)
    private ParticipantRole stageRole;

    @Enumerated(EnumType.STRING)
    @Column(name = "connection_status", nullable = false, length = 20)
    private ConnectionStatus connectionStatus;

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    @Column(name = "disconnected_at")
    private LocalDateTime disconnectedAt;

    @Column(name = "left_at")
    private LocalDateTime leftAt;

    private RoomParticipant(Room room, User user, LocalDateTime now) {
        this.room = room;
        this.user = user;
        this.stageRole = ParticipantRole.PARTICIPANT;
        this.connectionStatus = ConnectionStatus.CONNECTED;
        this.joinedAt = now;
    }

    public static RoomParticipant join(Room room, User user, LocalDateTime now) {
        return new RoomParticipant(room, user, now);
    }

    public void reconnect() {
        if (connectionStatus == ConnectionStatus.KICKED) {
            throw RoomException.reentryBanned();
        }

        if (connectionStatus == ConnectionStatus.LEFT) {
            throw RoomException.participantNotActive();
        }

        connectionStatus = ConnectionStatus.CONNECTED;
        disconnectedAt = null;
    }

    public void disconnect(LocalDateTime now) {
        if (!isActive()) {
            return;
        }

        connectionStatus = ConnectionStatus.DISCONNECTED;
        disconnectedAt = now;
    }

    public void leave(LocalDateTime now) {
        if (!isActive()) {
            return;
        }

        connectionStatus = ConnectionStatus.LEFT;
        leftAt = now;
    }

    public void kick(LocalDateTime now) {
        if (!isActive()) {
            throw RoomException.participantNotActive();
        }

        connectionStatus = ConnectionStatus.KICKED;
        leftAt = now;
    }

    public void promoteToPerformer() {
        requireOnline();
        stageRole = ParticipantRole.PERFORMER;
    }

    public void demoteToParticipant() {
        if (!isActive()) {
            throw RoomException.participantNotActive();
        }

        stageRole = ParticipantRole.PARTICIPANT;
    }

    public boolean isActive() {
        return connectionStatus == ConnectionStatus.CONNECTED
                || connectionStatus == ConnectionStatus.DISCONNECTED;
    }

    public boolean isOnline() {
        return connectionStatus == ConnectionStatus.CONNECTED;
    }

    public boolean isPerformer() {
        return stageRole == ParticipantRole.PERFORMER;
    }

    private void requireOnline() {
        if (connectionStatus != ConnectionStatus.CONNECTED) {
            throw RoomException.participantMustBeOnline();
        }
    }
}
