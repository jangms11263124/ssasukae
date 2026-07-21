package com.ssafy.ssasukae.domain.performance.entity;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.song.entity.Song;

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

@Entity
@Table(
    name = "performances",
    uniqueConstraints =
        @UniqueConstraint(
            name = "uk_performances_room_round",
            columnNames = {"room_id", "round_no"}))
public class Performance {

  protected Performance() {}

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "performance_id")
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "room_id", nullable = false)
  private Room room;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "performer_participant_id", nullable = false)
  private RoomParticipant performer;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "song_id", nullable = false)
  private Song song;

  @Column(name = "round_no", nullable = false)
  private int roundNo;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private PerformanceStatus status;

  @Column(nullable = false)
  private long version;

  @Column(name = "created_at", nullable = false, updatable = false)
  private LocalDateTime createdAt;

  @Column(name = "updated_at", nullable = false)
  private LocalDateTime updatedAt;

  private Performance(
      Room room,
      RoomParticipant performer,
      Song song,
      int roundNo,
      LocalDateTime now) {
    this.room = room;
    this.performer = performer;
    this.song = song;
    this.roundNo = roundNo;
    this.status = PerformanceStatus.PREPARING;
    this.version = 1L;
    this.createdAt = now;
    this.updatedAt = now;
  }

  public static Performance prepare(
      Room room,
      RoomParticipant performer,
      Song song,
      int roundNo,
      LocalDateTime now) {
    if (roundNo < 1) {
      throw new IllegalArgumentException("roundNo는 1 이상이어야 합니다.");
    }
    return new Performance(room, performer, song, roundNo, now);
  }

  public Long getId() {
    return id;
  }

  public Room getRoom() {
    return room;
  }

  public RoomParticipant getPerformer() {
    return performer;
  }

  public Song getSong() {
    return song;
  }

  public int getRoundNo() {
    return roundNo;
  }

  public PerformanceStatus getStatus() {
    return status;
  }

  public long getVersion() {
    return version;
  }

  public LocalDateTime getCreatedAt() {
    return createdAt;
  }

  public LocalDateTime getUpdatedAt() {
    return updatedAt;
  }
}
