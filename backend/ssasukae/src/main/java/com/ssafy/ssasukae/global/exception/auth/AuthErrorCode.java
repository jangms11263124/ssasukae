package com.ssafy.ssasukae.global.exception.auth;

import com.ssafy.ssasukae.global.exception.BaseErrorCode;

import org.springframework.http.HttpStatus;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum AuthErrorCode implements BaseErrorCode {

    ALREADY_REGISTERED(HttpStatus.CONFLICT, "이미 가입된 사용자입니다."),
    INVALID_REFRESH_TOKEN(HttpStatus.UNAUTHORIZED, "유효하지 않은 refresh token 입니다."),
    REFRESH_TOKEN_ALREADY_USED(HttpStatus.UNAUTHORIZED, "이미 사용되었거나 만료된 refresh token 입니다."),
    SESSION_EXPIRED(HttpStatus.UNAUTHORIZED, "다른 기기에서 로그인되어 세션이 만료되었습니다."),
    INVALID_SIGNUP_TOKEN(HttpStatus.UNAUTHORIZED, "회원가입용 토큰이 아닙니다."),
    REFRESH_TOKEN_REQUIRED(HttpStatus.UNAUTHORIZED, "refresh token이 없습니다.");

    private final HttpStatus httpStatus;
    private final String message;
}
