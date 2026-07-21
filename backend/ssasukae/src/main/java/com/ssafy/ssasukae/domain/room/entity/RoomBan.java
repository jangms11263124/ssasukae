package com.ssafy.ssasukae.domain.room.entity;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.domain.user.entity.User;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
    name = "room_bans",
    uniqueConstraints =
        @UniqueConstraint(
            name = "uk_room_bans_room_user",
            columnNames = {"room_id", "user_id"}))
public class RoomBan {

  protected RoomBan() {}

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "room_ban_id")
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "room_id", nullable = false)
  private Room room;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private User user;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "kicked_by_user_id", nullable = false)
  private User kickedBy;

  @Column(name = "created_at", nullable = false, updatable = false)
  private LocalDateTime createdAt;

  private RoomBan(Room room, User user, User kickedBy, LocalDateTime createdAt) {
    this.room = room;
    this.user = user;
    this.kickedBy = kickedBy;
    this.createdAt = createdAt;
  }

  public static RoomBan create(
      Room room, User user, User kickedBy, LocalDateTime createdAt) {
    return new RoomBan(room, user, kickedBy, createdAt);
  }

  public Long getId() {
    return id;
  }

  public Room getRoom() {
    return room;
  }

  public User getUser() {
    return user;
  }

  public User getKickedBy() {
    return kickedBy;
  }

  public LocalDateTime getCreatedAt() {
    return createdAt;
  }
}
