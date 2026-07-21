package com.ssafy.ssasukae.domain.room.service;

import com.ssafy.ssasukae.global.exception.room.RoomException;

import org.springframework.stereotype.Component;

@Component
public class RoomNamePolicy {

  private static final int MIN_LENGTH = 2;
  private static final int MAX_LENGTH = 20;
  private static final int MAX_SYMBOL_COUNT = 2;

  public String normalizeAndValidate(String rawName) {
    if (rawName == null) {
      throw RoomException.invalidSetting("방 이름은 필수입니다.");
    }

    String normalized = rawName.strip().replaceAll("\\s+", " ");
    int length = normalized.codePointCount(0, normalized.length());
    if (length < MIN_LENGTH || length > MAX_LENGTH) {
      throw RoomException.invalidSetting("방 이름은 2자 이상 20자 이하여야 합니다.");
    }

    int symbolCount = 0;
    for (int offset = 0; offset < normalized.length(); ) {
      int codePoint = normalized.codePointAt(offset);
      offset += Character.charCount(codePoint);

      if (Character.isLetterOrDigit(codePoint) || Character.isWhitespace(codePoint)) {
        continue;
      }

      if (isEmojiContinuation(codePoint)) {
        continue;
      }

      int type = Character.getType(codePoint);
      if (type == Character.OTHER_SYMBOL || type == Character.SURROGATE) {
        symbolCount++;
        continue;
      }

      throw RoomException.invalidSetting("방 이름에는 한글, 영문, 숫자, 공백과 일반 이모지만 사용할 수 있습니다.");
    }

    if (symbolCount > MAX_SYMBOL_COUNT) {
      throw RoomException.invalidSetting("방 이름에는 일반 이모지를 최대 2개까지 사용할 수 있습니다.");
    }

    return normalized;
  }

  private boolean isEmojiContinuation(int codePoint) {
    return codePoint == 0x200D
        || (codePoint >= 0xFE00 && codePoint <= 0xFE0F)
        || (codePoint >= 0xE0100 && codePoint <= 0xE01EF)
        || (codePoint >= 0x1F3FB && codePoint <= 0x1F3FF);
  }
}
