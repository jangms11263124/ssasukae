package com.ssafy.ssasukae.global.exception.user;

import com.ssafy.ssasukae.global.exception.BaseErrorCode;
import org.springframework.http.HttpStatus;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum UserErrorCode implements BaseErrorCode {
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "존재하지 않는 사용자입니다."),
    NICKNAME_REQUIRED(HttpStatus.BAD_REQUEST, "닉네임을 입력해주세요."),
    NICKNAME_DUPLICATED(HttpStatus.CONFLICT, "이미 사용중인 닉네임입니다.");

    private final HttpStatus httpStatus;
    private final String message;
}
