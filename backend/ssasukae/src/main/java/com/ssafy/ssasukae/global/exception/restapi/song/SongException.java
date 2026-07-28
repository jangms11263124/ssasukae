package com.ssafy.ssasukae.global.exception.restapi.song;

import com.ssafy.ssasukae.global.exception.restapi.room.RoomErrorCode;
import lombok.Getter;

@Getter
public class SongException extends RuntimeException {
    private final SongErrorCode errorCode;

    private SongException(SongErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }
}
