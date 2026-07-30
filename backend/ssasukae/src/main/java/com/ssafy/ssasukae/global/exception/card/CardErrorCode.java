package com.ssafy.ssasukae.global.exception.card;

import org.springframework.http.HttpStatus;

import com.ssafy.ssasukae.global.exception.BaseErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum CardErrorCode implements BaseErrorCode {
  CARD_CONFIGURATION_INVALID(
      HttpStatus.UNPROCESSABLE_CONTENT, "카드 설정이 올바르지 않습니다.");

  private final HttpStatus httpStatus;
  private final String message;
}
