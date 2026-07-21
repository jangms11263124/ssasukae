package com.ssafy.ssasukae.domain.card.service;

import java.util.List;

import com.ssafy.ssasukae.domain.card.entity.CardAssignment;

public record CardAssignmentBatch(List<CardAssignment> assignments) {

  public CardAssignmentBatch {
    assignments = List.copyOf(assignments);
  }

  public int assignedCount() {
    return assignments.size();
  }
}
