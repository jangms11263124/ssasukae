package com.ssafy.ssasukae.domain.room.entity;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.global.exception.room.RoomException;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.ParticipantRole;
import com.ssafy.ssasukae.domain.user.entity.User;

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
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;

@Entity
@Table(
    name = "room_participants",
    uniqueConstraints =
        @UniqueConstraint(
            name = "uk_room_participants_room_user",
            columnNames = {"room_id", "user_id"}))
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
  @Column(nullable = false, length = 20)
  private ParticipantRole role;

  @Enumerated(EnumType.STRING)
  @Column(name = "connection_status", nullable = false, length = 20)
  private ConnectionStatus connectionStatus;

  @Column(name = "is_ready", nullable = false)
  private boolean ready;

  @Column(name = "mic_enabled", nullable = false)
  private boolean micEnabled;

  @Column(name = "camera_enabled", nullable = false)
  private boolean cameraEnabled;

  @Version
  @Column(nullable = false)
  private long version;

  @Column(name = "joined_at", nullable = false, updatable = false)
  private LocalDateTime joinedAt;

  @Column(name = "last_seen_at", nullable = false)
  private LocalDateTime lastSeenAt;

  @Column(name = "disconnected_at")
  private LocalDateTime disconnectedAt;

  @Column(name = "left_at")
  private LocalDateTime leftAt;

  private RoomParticipant(
      Room room, User user, ParticipantRole role, LocalDateTime joinedAt) {
    this.room = room;
    this.user = user;
    this.role = role;
    this.connectionStatus = ConnectionStatus.ONLINE;
    this.ready = false;
    this.micEnabled = true;
    this.cameraEnabled = true;
    this.joinedAt = joinedAt;
    this.lastSeenAt = joinedAt;
  }

  public static RoomParticipant host(Room room, User user, LocalDateTime joinedAt) {
    return new RoomParticipant(room, user, ParticipantRole.HOST, joinedAt);
  }

  public static RoomParticipant participant(Room room, User user, LocalDateTime joinedAt) {
    return new RoomParticipant(room, user, ParticipantRole.PARTICIPANT, joinedAt);
  }

  public Long getId() { return id; }
  public Room getRoom() { return room; }
  public User getUser() { return user; }
  public ParticipantRole getRole() { return role; }
  public ConnectionStatus getConnectionStatus() { return connectionStatus; }
  public boolean isReady() { return ready; }
  public boolean isMicEnabled() { return micEnabled; }
  public boolean isCameraEnabled() { return cameraEnabled; }
  public long getVersion() { return version; }
  public LocalDateTime getJoinedAt() { return joinedAt; }
  public LocalDateTime getLastSeenAt() { return lastSeenAt; }
  public LocalDateTime getDisconnectedAt() { return disconnectedAt; }
  public LocalDateTime getLeftAt() { return leftAt; }

  public void reconnect(LocalDateTime now) {
    if (connectionStatus == ConnectionStatus.KICKED) {
      throw RoomException.reentryBanned();
    }
    connectionStatus = ConnectionStatus.ONLINE;
    disconnectedAt = null;
    leftAt = null;
    lastSeenAt = now;
  }

  public void disconnect(LocalDateTime now) {
    if (connectionStatus != ConnectionStatus.ONLINE) {
      return;
    }
    connectionStatus = ConnectionStatus.DISCONNECTED;
    ready = false;
    disconnectedAt = now;
    lastSeenAt = now;
  }

  public void leave(LocalDateTime now) {
    if (!isActive()) {
      throw RoomException.notActiveParticipant();
    }
    connectionStatus = ConnectionStatus.LEFT;
    ready = false;
    micEnabled = false;
    cameraEnabled = false;
    disconnectedAt = null;
    leftAt = now;
    lastSeenAt = now;
  }

  public void promoteToHost() {
    if (connectionStatus != ConnectionStatus.ONLINE) {
      throw RoomException.hostMustBeOnline();
    }
    role = ParticipantRole.HOST;
  }

  public void demoteToParticipant() {
    role = ParticipantRole.PARTICIPANT;
  }

  public boolean isActive() {
    return connectionStatus == ConnectionStatus.ONLINE
        || connectionStatus == ConnectionStatus.DISCONNECTED;
  }
}
