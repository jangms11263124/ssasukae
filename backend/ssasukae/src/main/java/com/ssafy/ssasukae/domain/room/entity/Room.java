package com.ssafy.ssasukae.domain.room.entity;

import java.time.LocalDateTime;


import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
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

@Entity
@Table(name = "rooms")
public class Room {

  protected Room() {}

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "room_id")
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "created_by_user_id", nullable = false)
  private User createdBy;

  @Column(name = "invite_code", nullable = false, unique = true, length = 6)
  private String inviteCode;

  @Column(nullable = false, length = 20)
  private String name;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private RoomMode mode;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private RoomStatus status;

  @Column(name = "max_participants", nullable = false)
  private int maxParticipants;

  @Column(name = "openvidu_session_id", nullable = false, length = 255)
  private String openViduSessionId;

  @Column(nullable = false)
  private long version;

  @Column(name = "created_at", nullable = false, updatable = false)
  private LocalDateTime createdAt;

  @Column(name = "last_activity_at", nullable = false)
  private LocalDateTime lastActivityAt;

  @Column(name = "finished_at")
  private LocalDateTime finishedAt;

  private Room(
      User createdBy,
      String inviteCode,
      String name,
      RoomMode mode,
      int maxParticipants,
      String openViduSessionId,
      LocalDateTime now) {
    this.createdBy = createdBy;
    this.inviteCode = inviteCode;
    this.name = name;
    this.mode = mode;
    this.status = RoomStatus.PREPARING;
    this.maxParticipants = maxParticipants;
    this.openViduSessionId = openViduSessionId;
    this.version = 1L;
    this.createdAt = now;
    this.lastActivityAt = now;
  }

  public static Room create(
      User createdBy,
      String inviteCode,
      String name,
      RoomMode mode,
      int maxParticipants,
      String openViduSessionId,
      LocalDateTime now) {
    return new Room(
        createdBy, inviteCode, name, mode, maxParticipants, openViduSessionId, now);
  }

  public Long getId() { return id; }
  public User getCreatedBy() { return createdBy; }
  public String getInviteCode() { return inviteCode; }
  public String getName() { return name; }
  public RoomMode getMode() { return mode; }
  public RoomStatus getStatus() { return status; }
  public int getMaxParticipants() { return maxParticipants; }
  public String getOpenViduSessionId() { return openViduSessionId; }
  public long getVersion() { return version; }
  public LocalDateTime getCreatedAt() { return createdAt; }
  public LocalDateTime getLastActivityAt() { return lastActivityAt; }
  public LocalDateTime getFinishedAt() { return finishedAt; }

  public void validateJoinable(long activeParticipantCount) {
    if (status == RoomStatus.FINISHED) {
      throw RoomException.closed();
    }
    if (status != RoomStatus.PREPARING) {
      throw RoomException.notJoinable();
    }
    if (activeParticipantCount >= maxParticipants) {
      throw RoomException.full();
    }
  }

  public long increaseVersion(LocalDateTime now) {
    version++;
    lastActivityAt = now;
    return version;
  }

  public long startPerformance(LocalDateTime now) {
    if (status == RoomStatus.FINISHED) {
      throw RoomException.closed();
    }
    if (status != RoomStatus.PREPARING) {
      throw RoomException.notReadyForPerformance();
    }
    status = RoomStatus.PLAYING;
    return increaseVersion(now);
  }

  public long recordPerformanceProgress(LocalDateTime now) {
    if (status == RoomStatus.FINISHED) {
      throw RoomException.closed();
    }
    if (status != RoomStatus.PLAYING) {
      throw RoomException.notPlaying();
    }
    return increaseVersion(now);
  }

  public long cancelPerformance(LocalDateTime now) {
    if (status == RoomStatus.FINISHED) {
      throw RoomException.closed();
    }
    if (status != RoomStatus.PLAYING) {
      throw RoomException.notPlaying();
    }
    status = RoomStatus.PREPARING;
    return increaseVersion(now);
  }

  public void finish(LocalDateTime now) {
    status = RoomStatus.FINISHED;
    finishedAt = now;
    lastActivityAt = now;
  }
}
