package com.ssafy.ssasukae.global.exception.lowlatency;

import com.ssafy.ssasukae.global.exception.BaseErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum LowLatencyErrorCode implements BaseErrorCode {
    APP_SESSION_AUTHENTICATION_REQUIRED(
            HttpStatus.UNAUTHORIZED, "앱 세션을 생성하려면 access token이 필요합니다."),
    ROOM_ACCESS_DENIED(HttpStatus.FORBIDDEN, "해당 방에 접근할 수 없습니다."),
    LOW_LATENCY_MODE_REQUIRED(HttpStatus.CONFLICT, "저지연 모드 방이 아닙니다."),
    RENDEZVOUS_SERVER_NOT_CONFIGURED(
            HttpStatus.INTERNAL_SERVER_ERROR, "Rendezvous 서버가 설정되지 않았습니다.");

    private final HttpStatus httpStatus;
    private final String message;
}
