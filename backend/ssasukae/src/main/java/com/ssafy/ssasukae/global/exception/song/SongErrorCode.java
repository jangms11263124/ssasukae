package com.ssafy.ssasukae.global.exception.song;

import com.ssafy.ssasukae.global.exception.BaseErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum SongErrorCode implements BaseErrorCode {
    LYRICS_NOT_FOUND(HttpStatus.NOT_FOUND, "가사가 존재하지 않습니다."),
    SONG_NOT_FOUND(HttpStatus.NOT_FOUND, "존재하지 않는 노래입니다."),
    UNSUPPORTED_SEARCH_FILTER(HttpStatus.BAD_REQUEST, "지원하지 않는 검색 필터입니다.");

    private final HttpStatus httpStatus;
    private final String message;
}
