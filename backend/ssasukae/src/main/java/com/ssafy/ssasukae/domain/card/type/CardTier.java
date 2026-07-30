package com.ssafy.ssasukae.domain.card.type;

public enum CardTier {
  S(10, 50),
  G(15, 30),
  P(20, 20);

  private final int durationSeconds;
  private final int drawWeight;

  CardTier(int durationSeconds, int drawWeight) {
    this.durationSeconds = durationSeconds;
    this.drawWeight = drawWeight;
  }

  public int durationSeconds() {
    return durationSeconds;
  }

  public int drawWeight() {
    return drawWeight;
  }

  public static CardTier fromDurationSeconds(Integer durationSeconds) {
    if (durationSeconds == null) {
      return null;
    }

    for (CardTier tier : values()) {
      if (tier.durationSeconds == durationSeconds) {
        return tier;
      }
    }
    return null;
  }
}
