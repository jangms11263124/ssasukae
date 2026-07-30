package com.ssafy.ssasukae.global.exception.favorite;

import com.ssafy.ssasukae.global.exception.BaseErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum FavoriteErrorCode implements BaseErrorCode {
    FAVORITE_NOT_FOUND(HttpStatus.NOT_FOUND, "존재하지 않는 찜 정보입니다.");

    private final HttpStatus httpStatus;
    private final String message;
}
