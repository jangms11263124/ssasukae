package com.ssafy.ssasukae.domain.room.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;


import com.ssafy.ssasukae.global.exception.room.RoomException;
import org.junit.jupiter.api.Test;

class RoomNamePolicyTest {

  private final RoomNamePolicy policy = new RoomNamePolicy();

  @Test
  void normalizesWhitespace() {
    assertThat(policy.normalizeAndValidate("  금요일   노래방  ")).isEqualTo("금요일 노래방");
  }

  @Test
  void allowsUpToTwoEmojiSymbols() {
    assertThat(policy.normalizeAndValidate("노래방 🎤🔥")).isEqualTo("노래방 🎤🔥");
  }

  @Test
  void rejectsInvalidPunctuation() {
    assertThatThrownBy(() -> policy.normalizeAndValidate("노래방!!!"))
        .isInstanceOf(RoomException.class);
  }
}
