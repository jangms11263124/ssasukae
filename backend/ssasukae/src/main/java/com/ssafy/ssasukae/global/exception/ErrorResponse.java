package com.ssafy.ssasukae.global.exception;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class ErrorResponse {

    private int status;
    private String code;
    private String message;

    public static ErrorResponse of(int status, String code, String message) {
        return new ErrorResponse(status, code, message);
    }
}
