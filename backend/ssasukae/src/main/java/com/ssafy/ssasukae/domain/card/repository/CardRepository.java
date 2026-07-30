package com.ssafy.ssasukae.domain.card.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ssafy.ssasukae.domain.card.entity.Card;

public interface CardRepository extends JpaRepository<Card, Long> {}
