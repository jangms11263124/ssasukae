package com.ssafy.ssasukae.domain.card.service;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import com.ssafy.ssasukae.domain.card.entity.CardDefinition;
import com.ssafy.ssasukae.domain.card.repository.CardDefinitionRepository;
import com.ssafy.ssasukae.domain.card.type.CardEffectType;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class CardDefinitionInitializer implements ApplicationRunner {

  private static final int DEFAULT_WEIGHT = 1;
  private static final int DEFAULT_DURATION_SECONDS = CardDefinition.MVP_DURATION_SECONDS;
  private static final List<CardSeed> MVP_CARDS = createMvpCards();
  private static final Set<String> MVP_CODES =
      MVP_CARDS.stream().map(CardSeed::code).collect(Collectors.toUnmodifiableSet());

  private final CardDefinitionRepository cardDefinitionRepository;

  public CardDefinitionInitializer(CardDefinitionRepository cardDefinitionRepository) {
    this.cardDefinitionRepository = cardDefinitionRepository;
  }

  @Override
  @Transactional
  public void run(ApplicationArguments args) {
    cardDefinitionRepository.findAll().stream()
        .filter(card -> !MVP_CODES.contains(card.getCode()))
        .forEach(CardDefinition::deactivate);

    MVP_CARDS.forEach(
        seed ->
            cardDefinitionRepository
                .findByCode(seed.code())
                .ifPresentOrElse(
                    card ->
                        card.synchronize(
                            seed.name(),
                            seed.description(),
                            seed.effectType(),
                            seed.effectValue(),
                            seed.durationSeconds(),
                            DEFAULT_WEIGHT),
                    () ->
                        cardDefinitionRepository.save(
                            CardDefinition.active(
                                seed.code(),
                                seed.name(),
                                seed.description(),
                                seed.effectType(),
                                seed.effectValue(),
                                seed.durationSeconds(),
                                DEFAULT_WEIGHT))));
  }

  private static List<CardSeed> createMvpCards() {
    return List.of(
        shift("PITCH_UP_3", "음정 상승", CardEffectType.PITCH_SHIFT, 3),
        shift("PITCH_DOWN_3", "음정 하강", CardEffectType.PITCH_SHIFT, -3),
        shift("TEMPO_UP_3", "템포 상승", CardEffectType.TEMPO_SHIFT, 3),
        shift("TEMPO_DOWN_3", "템포 하강", CardEffectType.TEMPO_SHIFT, -3),
        simple(
            "LYRICS_HIDDEN",
            "가사 가리기",
            "가사를 " + DEFAULT_DURATION_SECONDS + "초 동안 가립니다.",
            CardEffectType.LYRICS_HIDDEN),
        simple(
            "MIC_INTRUSION",
            "마이크 난입",
            "카드 사용자가 " + DEFAULT_DURATION_SECONDS + "초 동안 마이크로 난입합니다.",
            CardEffectType.MIC_INTRUSION));
  }

  private static CardSeed shift(
      String code, String name, CardEffectType effectType, int value) {
    String target = effectType == CardEffectType.PITCH_SHIFT ? "음정" : "템포";
    String direction = value > 0 ? "올립니다" : "내립니다";
    return new CardSeed(
        code,
        name,
        target + "을(를) " + Math.abs(value) + "만큼 " + direction + ".",
        effectType,
        value,
        DEFAULT_DURATION_SECONDS);
  }

  private static CardSeed simple(
      String code, String name, String description, CardEffectType effectType) {
    return new CardSeed(
        code, name, description, effectType, null, DEFAULT_DURATION_SECONDS);
  }

  private record CardSeed(
      String code,
      String name,
      String description,
      CardEffectType effectType,
      Integer effectValue,
      int durationSeconds) {}
}
