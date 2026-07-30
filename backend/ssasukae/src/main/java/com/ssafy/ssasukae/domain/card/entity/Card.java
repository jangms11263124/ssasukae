package com.ssafy.ssasukae.domain.card.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import com.ssafy.ssasukae.domain.card.type.CardTier;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectTargetType;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;

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

  @Column(name = "card_image_url", nullable = false, length = 1000)
  private String cardImageUrl;

  @Enumerated(EnumType.STRING)
  @Column(name = "effect_type", nullable = false, length = 30)
  private CardEffectType effectType;

  @Column(name = "effect_value")
  private Integer effectValue;

  @Enumerated(EnumType.STRING)
  @Column(name = "tier", length = 1)
  private CardTier tier;

  @Column(name = "duration_seconds", nullable = false)
  private Integer durationSeconds;

  @Column(name = "draw_weight", nullable = false)
  private Integer drawWeight;

  private Card(
      String code,
      String name,
      String description,
      String cardImageUrl,
      CardEffectType effectType,
      Integer effectValue,
      CardTier tier,
      Integer durationSeconds,
      Integer drawWeight) {
    this.code = code;
    this.name = name;
    this.description = description;
    this.cardImageUrl = cardImageUrl;
    this.effectType = effectType;
    this.effectValue = effectValue;
    this.tier = tier;
    this.durationSeconds = durationSeconds;
    this.drawWeight = drawWeight == null ? 1 : drawWeight;
    validateConfiguration();
  }

  public static Card create(
      String code,
      String name,
      String description,
      String cardImageUrl,
      CardEffectType effectType,
      Integer effectValue,
      CardTier tier,
      Integer durationSeconds,
      Integer drawWeight) {
    return new Card(
        code,
        name,
        description,
        cardImageUrl,
        effectType,
        effectValue,
        tier,
        durationSeconds,
        drawWeight);
  }

  public CardEffectTargetType getTargetType() {
    return effectType == CardEffectType.MIC_OPEN
        ? CardEffectTargetType.CARD_OWNER
        : CardEffectTargetType.PERFORMER;
  }

  public boolean isDrawable() {
    try {
      validateConfiguration();
      return id != null && id > 0;
    } catch (IllegalArgumentException exception) {
      return false;
    }
  }

  public void validateConfiguration() {
    if (cardImageUrl == null || cardImageUrl.isBlank()) {
      throw new IllegalArgumentException("카드 이미지 URL은 필수입니다.");
    }
    if (code == null || code.isBlank() || effectType == null) {
      throw new IllegalArgumentException("카드 코드와 효과 종류는 필수입니다.");
    }
    if (durationSeconds == null || durationSeconds <= 0) {
      throw new IllegalArgumentException("카드 지속 시간은 양수여야 합니다.");
    }
    if (drawWeight == null || drawWeight <= 0) {
      throw new IllegalArgumentException("카드 추첨 가중치는 양수여야 합니다.");
    }
    if ((effectType == CardEffectType.MR_KEY_CHANGE || effectType == CardEffectType.MR_TEMPO_CHANGE)
        && (effectValue == null || effectValue < -6 || effectValue > 6)) {
      throw new IllegalArgumentException("키·템포 카드 효과 값은 -6부터 6 사이여야 합니다.");
    }
    if ((effectType == CardEffectType.MIC_OPEN || effectType == CardEffectType.LYRICS_HIDE)
        && effectValue != null) {
      throw new IllegalArgumentException("이 카드 효과에는 수치가 없어야 합니다.");
    }
  }
}
