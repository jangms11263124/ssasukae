package com.ssafy.ssasukae.domain.card.service;

import java.util.List;

import com.ssafy.ssasukae.domain.card.entity.CardDefinition;
import com.ssafy.ssasukae.global.exception.card.CardException;

import org.springframework.stereotype.Component;

@Component
public class WeightedCardPicker {

  private final CardRandomGenerator randomGenerator;

  public WeightedCardPicker(CardRandomGenerator randomGenerator) {
    this.randomGenerator = randomGenerator;
  }

  public CardDefinition pick(List<CardDefinition> cards) {
    if (cards.isEmpty()) {
      throw CardException.noActiveDefinition();
    }

    int totalWeight = cards.stream().mapToInt(CardDefinition::getWeight).sum();
    int ticket = randomGenerator.nextInt(totalWeight);

    int accumulated = 0;
    for (CardDefinition card : cards) {
      accumulated += card.getWeight();
      if (ticket < accumulated) {
        return card;
      }
    }
    throw new IllegalStateException("카드 가중치 추첨 결과를 결정할 수 없습니다.");
  }
}
