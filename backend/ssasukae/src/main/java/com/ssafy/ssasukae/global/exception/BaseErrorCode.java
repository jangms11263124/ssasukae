package com.ssafy.ssasukae.global.exception;

import org.springframework.http.HttpStatus;

public interface BaseErrorCode {

    HttpStatus getHttpStatus();

    String getMessage();

    String name();
}
