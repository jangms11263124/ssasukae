package com.ssafy.ssasukae.domain.card.entity;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.domain.card.type.CardAssignmentStatus;
import com.ssafy.ssasukae.domain.performance.entity.Performance;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;

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
    name = "card_assignments",
    uniqueConstraints =
        @UniqueConstraint(
            name = "uk_card_assignments_performance_owner",
            columnNames = {"performance_id", "owner_participant_id"}))
public class CardAssignment {

  protected CardAssignment() {}

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "card_assignment_id")
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "performance_id", nullable = false)
  private Performance performance;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "owner_participant_id", nullable = false)
  private RoomParticipant owner;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "card_definition_id", nullable = false)
  private CardDefinition cardDefinition;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 30)
  private CardAssignmentStatus status;

  @Version
  @Column(nullable = false)
  private long version;

  @Column(name = "assigned_at", nullable = false, updatable = false)
  private LocalDateTime assignedAt;

  private CardAssignment(
      Performance performance,
      RoomParticipant owner,
      CardDefinition cardDefinition,
      LocalDateTime assignedAt) {
    this.performance = performance;
    this.owner = owner;
    this.cardDefinition = cardDefinition;
    this.status = CardAssignmentStatus.ASSIGNED;
    this.assignedAt = assignedAt;
  }

  public static CardAssignment assign(
      Performance performance,
      RoomParticipant owner,
      CardDefinition cardDefinition,
      LocalDateTime assignedAt) {
    Long performerParticipantId = performance.getPerformer().getId();
    boolean sameParticipant =
        performance.getPerformer() == owner
            || (performerParticipantId != null && performerParticipantId.equals(owner.getId()));
    if (sameParticipant) {
      throw new IllegalArgumentException("공연자에게는 방해 카드를 배정할 수 없습니다.");
    }
    return new CardAssignment(performance, owner, cardDefinition, assignedAt);
  }

  public Long getId() {
    return id;
  }

  public Performance getPerformance() {
    return performance;
  }

  public RoomParticipant getOwner() {
    return owner;
  }

  public CardDefinition getCardDefinition() {
    return cardDefinition;
  }

  public CardAssignmentStatus getStatus() {
    return status;
  }

  public long getVersion() {
    return version;
  }

  public LocalDateTime getAssignedAt() {
    return assignedAt;
  }
}
