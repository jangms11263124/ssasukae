package com.ssafy.ssasukae.global.exception.websocket;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum WebSocketErrorCode {

    // 인증
    UNAUTHORIZED("인증 정보가 없거나 유효하지 않습니다."),
    TOKEN_EXPIRED("Access Token이 만료되었습니다."),

    // STOMP 명령 및 목적지
    UNSUPPORTED_STOMP_COMMAND("지원하지 않는 STOMP 명령입니다."),
    INVALID_SEND_DESTINATION("허용되지 않은 메시지 전송 경로입니다."),
    INVALID_SUBSCRIBE_DESTINATION("허용되지 않은 구독 경로입니다."),

    // 접근 및 기능 권한
    ROOM_ACCESS_DENIED("해당 방의 참가자가 아닙니다."),
    ACTION_NOT_ALLOWED("요청을 실행할 권한이 없습니다."),

    // 요청 및 비즈니스
    INVALID_REQUEST("요청값이 올바르지 않습니다."),
    INVALID_ROOM_STATE("현재 방 상태에서는 요청을 처리할 수 없습니다."),
    RESOURCE_NOT_FOUND("요청 대상이 존재하지 않습니다."),
    DUPLICATE_REQUEST("동일한 요청이 이미 처리되었습니다."),

    // 서버
    INTERNAL_SERVER_ERROR("서버 내부 오류가 발생했습니다.");

    private final String defaultMessage;
}