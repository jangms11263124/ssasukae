package com.ssafy.ssasukae.global.exception.restapi.song;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum SongErrorCode {
    SONG_NOT_FOUND(HttpStatus.NOT_FOUND, "존재하지 않는 노래입니다.");

    private final HttpStatus httpStatus;
    private final String message;
}
