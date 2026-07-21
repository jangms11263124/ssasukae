package com.ssafy.ssasukae.domain.card.service;

import java.time.LocalDateTime;
import java.util.List;

import com.ssafy.ssasukae.domain.card.entity.CardAssignment;
import com.ssafy.ssasukae.domain.card.entity.CardDefinition;
import com.ssafy.ssasukae.domain.card.repository.CardAssignmentRepository;
import com.ssafy.ssasukae.domain.card.repository.CardDefinitionRepository;
import com.ssafy.ssasukae.domain.performance.entity.Performance;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.global.exception.card.CardException;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CardAssignmentService {

  private final CardDefinitionRepository cardDefinitionRepository;
  private final CardAssignmentRepository cardAssignmentRepository;
  private final RoomParticipantRepository roomParticipantRepository;
  private final WeightedCardPicker weightedCardPicker;

  public CardAssignmentService(
      CardDefinitionRepository cardDefinitionRepository,
      CardAssignmentRepository cardAssignmentRepository,
      RoomParticipantRepository roomParticipantRepository,
      WeightedCardPicker weightedCardPicker) {
    this.cardDefinitionRepository = cardDefinitionRepository;
    this.cardAssignmentRepository = cardAssignmentRepository;
    this.roomParticipantRepository = roomParticipantRepository;
    this.weightedCardPicker = weightedCardPicker;
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public CardAssignmentBatch assignForPerformance(
      Performance performance, LocalDateTime assignedAt) {
    if (cardAssignmentRepository.existsByPerformance_Id(performance.getId())) {
      throw CardException.alreadyAssigned();
    }

    List<RoomParticipant> recipients =
        roomParticipantRepository
            .findAllByRoom_IdAndConnectionStatusOrderByJoinedAtAsc(
                performance.getRoom().getId(), ConnectionStatus.ONLINE)
            .stream()
            .filter(participant -> !participant.getId().equals(performance.getPerformer().getId()))
            .toList();

    if (recipients.isEmpty()) {
      return new CardAssignmentBatch(List.of());
    }

    List<CardDefinition> activeCards =
        cardDefinitionRepository.findAllByActiveTrueOrderByIdAsc();
    if (activeCards.isEmpty()) {
      throw CardException.noActiveDefinition();
    }

    List<CardAssignment> assignments =
        recipients.stream()
            .map(
                participant ->
                    CardAssignment.assign(
                        performance,
                        participant,
                        weightedCardPicker.pick(activeCards),
                        assignedAt))
            .toList();

    return new CardAssignmentBatch(cardAssignmentRepository.saveAll(assignments));
  }
}
