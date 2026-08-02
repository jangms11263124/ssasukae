package com.ssafy.ssasukae.domain.card.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import com.ssafy.ssasukae.domain.card.type.CardTier;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectTargetType;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.card.CardErrorCode;

import lombok.Getter;

@Entity
@Table(name = "cards")
@Getter
public class Card {

  protected Card() {}

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "card_id", nullable = false)
  private Long id;

  @Column(name = "code", nullable = false, unique = true, length = 50)
  private String code;

  @Column(name = "name", nullable = false, length = 100)
  private String name;

  @Column(name = "description", length = 1000)
  private String description;

  @Enumerated(EnumType.STRING)
  @Column(name = "effect_type", nullable = false, length = 30)
  private CardEffectType effectType;

  @Column(name = "effect_value")
  private Integer effectValue;

  @Enumerated(EnumType.STRING)
  @Column(name = "tier", nullable = false, length = 1)
  private CardTier tier;

  @Column(name = "duration_seconds", nullable = false)
  private Integer durationSeconds;

  @Column(name = "draw_weight", nullable = false)
  private Integer drawWeight;

  private Card(
      String code,
      String name,
      String description,
      CardEffectType effectType,
      Integer effectValue,
      Integer durationSeconds) {
    this.code = code;
    this.name = name;
    this.description = description;
    this.effectType = effectType;
    this.effectValue = effectValue;
    this.durationSeconds = durationSeconds;
    synchronizeTierAndDrawWeight();
    validateConfiguration();
  }

  public static Card create(
      String code,
      String name,
      String description,
      CardEffectType effectType,
      Integer effectValue,
      Integer durationSeconds) {
    return new Card(
        code, name, description, effectType, effectValue, durationSeconds);
  }

  public CardEffectTargetType getTargetType() {
    return effectType == CardEffectType.MIC_OPEN
        ? CardEffectTargetType.CARD_OWNER
        : CardEffectTargetType.PERFORMER;
  }

  public boolean isDrawable() {
    return id != null && id > 0 && configurationErrorMessage() == null;
  }

  public void validateConfiguration() {
    String errorMessage = configurationErrorMessage();
    if (errorMessage != null) {
      throw new CustomException(CardErrorCode.CARD_CONFIGURATION_INVALID);
    }
  }

  @PrePersist
  @PreUpdate
  private void synchronizeTierAndDrawWeight() {
    CardTier calculatedTier = CardTier.fromDurationSeconds(durationSeconds);
    if (calculatedTier == null) {
      throw new CustomException(CardErrorCode.CARD_CONFIGURATION_INVALID);
    }
    this.tier = calculatedTier;
    this.drawWeight = calculatedTier.drawWeight();
  }

  private String configurationErrorMessage() {
    if (code == null || code.isBlank() || effectType == null) {
      return "카드 코드와 효과 종류는 필수입니다.";
    }
    CardTier calculatedTier = CardTier.fromDurationSeconds(durationSeconds);
    if (calculatedTier == null) {
      return "카드 지속 시간은 10초, 15초, 20초 중 하나여야 합니다.";
    }
    if (tier != calculatedTier || drawWeight == null || drawWeight != calculatedTier.drawWeight()) {
      return "카드 티어와 추첨 가중치가 지속 시간 기준과 일치해야 합니다.";
    }
    if ((effectType == CardEffectType.MR_KEY_CHANGE || effectType == CardEffectType.MR_TEMPO_CHANGE)
        && (effectValue == null || effectValue < -6 || effectValue > 6)) {
      return "키·템포 카드 효과 값은 -6부터 6 사이여야 합니다.";
    }
    if ((effectType == CardEffectType.MIC_OPEN || effectType == CardEffectType.LYRICS_HIDE)
        && effectValue != null) {
      return "이 카드 효과에는 수치가 없어야 합니다.";
    }
    return null;
  }
}
