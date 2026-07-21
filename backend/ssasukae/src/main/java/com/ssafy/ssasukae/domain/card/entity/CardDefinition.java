package com.ssafy.ssasukae.domain.card.entity;

import java.util.Objects;

import com.ssafy.ssasukae.domain.card.type.CardEffectType;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;

@Entity
@Getter
@Table(
        name = "card_definitions",
        uniqueConstraints =
        @UniqueConstraint(
                name = "uk_card_definitions_code",
                columnNames = "code"))
public class CardDefinition {

  /**
   * 음정 및 템포 조절량.
   * 허용값은 +3 또는 -3이다.
   */
  public static final int MVP_SHIFT_AMOUNT = 3;

  /**
   * 카드 효과 기본 지속 시간.
   */
  public static final int MVP_DURATION_SECONDS = 10;

  @Getter
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "card_definition_id")
  private Long id;

  @Column(nullable = false, length = 50)
  private String code;

  @Column(nullable = false, length = 50)
  private String name;

  @Column(nullable = false, length = 255)
  private String description;

  @Enumerated(EnumType.STRING)
  @Column(name = "effect_type", nullable = false, length = 30)
  private CardEffectType effectType;

  @Column(name = "effect_value")
  private Integer effectValue;

  @Column(name = "duration_seconds", nullable = false)
  private Integer durationSeconds;

  @Getter
  @Column(nullable = false)
  private int weight;

  @Column(nullable = false)
  private boolean active;

  protected CardDefinition() {}

  private CardDefinition(
          String code,
          String name,
          String description,
          CardEffectType effectType,
          Integer effectValue,
          int durationSeconds,
          int weight,
          boolean active) {

    validate(
            code,
            name,
            description,
            effectType,
            effectValue,
            durationSeconds,
            weight);

    this.code = code;
    this.name = name;
    this.description = description;
    this.effectType = effectType;
    this.effectValue = effectValue;
    this.durationSeconds = durationSeconds;
    this.weight = weight;
    this.active = active;
  }

  public static CardDefinition active(
          String code,
          String name,
          String description,
          CardEffectType effectType,
          Integer effectValue,
          int durationSeconds,
          int weight) {

    return new CardDefinition(
            code,
            name,
            description,
            effectType,
            effectValue,
            durationSeconds,
            weight,
            true);
  }

  public void synchronize(
          String name,
          String description,
          CardEffectType effectType,
          Integer effectValue,
          int durationSeconds,
          int weight) {

    validate(
            code,
            name,
            description,
            effectType,
            effectValue,
            durationSeconds,
            weight);

    this.name = name;
    this.description = description;
    this.effectType = effectType;
    this.effectValue = effectValue;
    this.durationSeconds = durationSeconds;
    this.weight = weight;
    this.active = true;
  }

  public void deactivate() {
    this.active = false;
  }

  private static void validate(
          String code,
          String name,
          String description,
          CardEffectType effectType,
          Integer effectValue,
          int durationSeconds,
          int weight) {

    if (code == null || code.isBlank()) {
      throw new IllegalArgumentException("카드 코드는 필수입니다.");
    }

    if (name == null || name.isBlank()) {
      throw new IllegalArgumentException("카드 이름은 필수입니다.");
    }

    if (description == null || description.isBlank()) {
      throw new IllegalArgumentException("카드 설명은 필수입니다.");
    }

    Objects.requireNonNull(
            effectType,
            "카드 효과 종류는 필수입니다.");

    if (durationSeconds <= 0) {
      throw new IllegalArgumentException(
              "카드 지속 시간은 1초 이상이어야 합니다.");
    }

    if (weight <= 0) {
      throw new IllegalArgumentException(
              "카드 가중치는 1 이상이어야 합니다.");
    }

    validateEffect(effectType, effectValue);
  }

  private static void validateEffect(
          CardEffectType effectType,
          Integer effectValue) {

    switch (effectType) {
      case PITCH_SHIFT, TEMPO_SHIFT -> {
        if (effectValue == null
                || Math.abs(effectValue) != MVP_SHIFT_AMOUNT) {

          throw new IllegalArgumentException(
                  "음정·템포 조절값은 +"
                          + MVP_SHIFT_AMOUNT
                          + " 또는 -"
                          + MVP_SHIFT_AMOUNT
                          + "이어야 합니다.");
        }
      }

      case LYRICS_HIDDEN, MIC_INTRUSION -> {
        if (effectValue != null) {
          throw new IllegalArgumentException(
                  "해당 카드 효과에는 효과값을 지정할 수 없습니다.");
        }
      }
    }
  }
}