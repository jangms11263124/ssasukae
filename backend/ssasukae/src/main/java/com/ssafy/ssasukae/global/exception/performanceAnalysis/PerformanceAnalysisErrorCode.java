package com.ssafy.ssasukae.global.exception.performanceAnalysis;

import org.springframework.http.HttpStatus;

import com.ssafy.ssasukae.global.exception.BaseErrorCode;

public enum PerformanceAnalysisErrorCode implements BaseErrorCode {
  UNAUTHORIZED_AI_SERVER(HttpStatus.UNAUTHORIZED, "신뢰할 수 없는 AI 서버 요청입니다."),
  INVALID_REQUEST(HttpStatus.BAD_REQUEST, "요청값이 올바르지 않습니다."),
  INVALID_SCORE_RANGE(HttpStatus.BAD_REQUEST, "점수는 0 이상 100 이하이고 소수점 둘째 자리까지 입력해야 합니다."),
  RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "요청한 공연, 사용자 또는 노래를 찾을 수 없습니다."),
  INVALID_PERFORMANCE_STATE(HttpStatus.CONFLICT, "분석 중인 공연에만 최종 결과를 반영할 수 있습니다."),
  ANALYSIS_DEADLINE_EXPIRED(HttpStatus.CONFLICT, "AI 분석 마감 시간이 지나 결과를 반영할 수 없습니다."),
  INVALID_ROOM_STATE(HttpStatus.CONFLICT, "공연 결과를 반영할 수 없는 방 상태입니다.");

  private final HttpStatus httpStatus;
  private final String message;

  PerformanceAnalysisErrorCode(HttpStatus httpStatus, String message) {
    this.httpStatus = httpStatus;
    this.message = message;
  }

  @Override
  public HttpStatus getHttpStatus() {
    return httpStatus;
  }

  @Override
  public String getMessage() {
    return message;
  }
}
