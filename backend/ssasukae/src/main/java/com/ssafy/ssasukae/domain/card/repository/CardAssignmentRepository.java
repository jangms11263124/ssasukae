package com.ssafy.ssasukae.domain.card.repository;

import java.util.List;

import com.ssafy.ssasukae.domain.card.entity.CardAssignment;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CardAssignmentRepository extends JpaRepository<CardAssignment, Long> {

  boolean existsByPerformance_Id(Long performanceId);

  @EntityGraph(attributePaths = {"owner.user", "cardDefinition"})
  List<CardAssignment> findAllByPerformance_IdOrderByOwner_IdAsc(Long performanceId);
}
