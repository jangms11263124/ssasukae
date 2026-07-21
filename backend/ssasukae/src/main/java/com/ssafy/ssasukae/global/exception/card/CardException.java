package com.ssafy.ssasukae.global.exception.card;

import org.springframework.http.HttpStatus;

public class CardException extends RuntimeException {

  private final HttpStatus status;
  private final String errorCode;

  private CardException(HttpStatus status, String errorCode, String message) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }

  public static CardException noActiveDefinition() {
    return new CardException(
        HttpStatus.CONFLICT,
        "ACTIVE_CARD_DEFINITION_NOT_FOUND",
        "배정할 수 있는 활성 카드가 없습니다.");
  }

  public static CardException alreadyAssigned() {
    return new CardException(
        HttpStatus.CONFLICT,
        "CARD_ASSIGNMENT_ALREADY_COMPLETED",
        "해당 공연의 카드 배정이 이미 완료되었습니다.");
  }

  public HttpStatus getStatus() {
    return status;
  }

  public String getErrorCode() {
    return errorCode;
  }
}
