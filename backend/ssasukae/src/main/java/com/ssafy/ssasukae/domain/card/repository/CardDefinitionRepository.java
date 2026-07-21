package com.ssafy.ssasukae.domain.card.repository;

import java.util.List;
import java.util.Optional;

import com.ssafy.ssasukae.domain.card.entity.CardDefinition;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CardDefinitionRepository extends JpaRepository<CardDefinition, Long> {

  List<CardDefinition> findAllByActiveTrueOrderByIdAsc();

  Optional<CardDefinition> findByCode(String code);
}
