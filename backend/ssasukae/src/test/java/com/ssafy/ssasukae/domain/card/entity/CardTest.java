package com.ssafy.ssasukae.domain.card.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.test.util.ReflectionTestUtils;

import com.ssafy.ssasukae.domain.card.type.CardTier;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.card.CardErrorCode;

class CardTest {

  @ParameterizedTest
  @CsvSource({"10, S, 50", "15, G, 30", "20, P, 20"})
  void durationAutomaticallyDeterminesTierAndDrawWeight(
      int durationSeconds, CardTier expectedTier, int expectedDrawWeight) {
    Card card = cardWithDuration(durationSeconds);

    assertThat(card.getTier()).isEqualTo(expectedTier);
    assertThat(card.getDrawWeight()).isEqualTo(expectedDrawWeight);
  }

  @Test
  void unsupportedDurationIsRejected() {
    assertThatThrownBy(() -> cardWithDuration(12))
        .isInstanceOfSatisfying(
            CustomException.class,
            exception ->
                assertThat(exception.getErrorCode())
                    .isEqualTo(CardErrorCode.CARD_CONFIGURATION_INVALID));
  }

  @Test
  void persistenceCallbackRecalculatesTierAndDrawWeight() {
    Card card = validCard();
    ReflectionTestUtils.setField(card, "durationSeconds", 20);
    ReflectionTestUtils.setField(card, "tier", CardTier.G);
    ReflectionTestUtils.setField(card, "drawWeight", 50);

    ReflectionTestUtils.invokeMethod(card, "synchronizeTierAndDrawWeight");

    assertThat(card.getTier()).isEqualTo(CardTier.P);
    assertThat(card.getDrawWeight()).isEqualTo(20);
  }

  @Test
  void validCardIsDrawableAfterItIsPersisted() {
    Card card = validCard();
    ReflectionTestUtils.setField(card, "id", 1L);

    assertThat(card.isDrawable()).isTrue();
  }

  @Test
  void invalidCardIsNotDrawableWithoutThrowingAnException() {
    Card card = validCard();
    ReflectionTestUtils.setField(card, "id", 1L);
    ReflectionTestUtils.setField(card, "cardImageUrl", " ");

    assertThatCode(card::isDrawable).doesNotThrowAnyException();
    assertThat(card.isDrawable()).isFalse();
  }

  @Test
  void explicitValidationReportsInvalidEntityState() {
    Card card = validCard();
    ReflectionTestUtils.setField(card, "cardImageUrl", null);

    assertThatThrownBy(card::validateConfiguration)
        .isInstanceOfSatisfying(
            CustomException.class,
            exception ->
                assertThat(exception.getErrorCode())
                    .isEqualTo(CardErrorCode.CARD_CONFIGURATION_INVALID));
  }

  private Card validCard() {
    return cardWithDuration(15);
  }

  private Card cardWithDuration(int durationSeconds) {
    return Card.create(
        "MIC_OPEN",
        "마이크 개방",
        "카드 사용자의 마이크를 개방합니다.",
        "https://cdn.example.com/cards/mic-open.webp",
        CardEffectType.MIC_OPEN,
        null,
        durationSeconds);
  }
}
