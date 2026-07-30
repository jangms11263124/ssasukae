package com.ssafy.ssasukae.global.exception.websocket;

import lombok.Getter;

@Getter
public enum WebSocketErrorCode {

    /*
     * 인증
     */
    UNAUTHORIZED("인증 정보가 없거나 유효하지 않습니다."),
    TOKEN_EXPIRED("Access Token이 만료되었습니다."),

    /*
     * STOMP 프로토콜 및 Destination 검증
     */
    UNSUPPORTED_STOMP_COMMAND("지원하지 않는 STOMP 명령입니다."),
    INVALID_SEND_DESTINATION("허용되지 않은 메시지 전송 경로입니다."),
    INVALID_SUBSCRIBE_DESTINATION("허용되지 않은 구독 경로입니다."),

    /*
     * 공통 요청 및 비즈니스 오류
     */
    INVALID_REQUEST("요청값이 올바르지 않습니다."),
    RESOURCE_NOT_FOUND("요청 대상이 존재하지 않습니다."),
    DUPLICATE_REQUEST("동일한 요청이 이미 처리되었습니다."),
    ACTION_NOT_ALLOWED("요청을 실행할 권한이 없습니다."),

    /*
     * 방
     */
    INVALID_ROOM_STATE("현재 방 상태에서는 요청을 처리할 수 없습니다."),
    ROOM_ACCESS_DENIED("해당 방의 참가자가 아닙니다."),

    /*
     * 공연
     */
    INVALID_PERFORMANCE_STATE("현재 공연 상태에서는 요청을 처리할 수 없습니다."),
    INVALID_PERFORMANCE_SETTING("공연 설정값이 허용 범위를 벗어났습니다."),
    PERFORMANCE_ROOM_MISMATCH("요청한 방과 공연 정보가 일치하지 않습니다."),
    PERFORMANCE_ALREADY_IN_PROGRESS("이미 준비 또는 진행 중인 공연이 있습니다."),
    PERFORMANCE_RESOURCE_NOT_READY("공연에 필요한 리소스가 준비되지 않았습니다."),
    DOWNLOAD_URL_GENERATION_FAILED("공연 리소스 다운로드 URL 생성에 실패했습니다."),
    PERFORMER_PERMISSION_REQUIRED("현재 공연자만 요청할 수 있습니다."),

    /*
     * 카드
     */
    INVALID_ROOM_MODE("BATTLE 모드에서만 카드를 사용할 수 있습니다."),
    NO_ACTIVE_PERFORMANCE("진행 중인 공연이 없습니다."),
    PERFORMANCE_MISMATCH("요청한 공연과 현재 공연이 일치하지 않습니다."),
    NO_ACTIVE_PERFORMER("카드 효과를 적용할 공연자가 없습니다."),
    PLAYBACK_NOT_RUNNING("음원 재생 중에만 카드를 사용할 수 있습니다."),
    INSUFFICIENT_PLAYBACK_TIME("음원 종료가 임박하여 카드를 사용할 수 없습니다."),
    PARTICIPANT_NOT_ACTIVE("현재 카드를 사용할 수 없는 참가자 상태입니다."),
    PARTICIPANT_OFFLINE("현재 연결 상태에서는 카드를 사용할 수 없습니다."),
    PERFORMER_CANNOT_USE_CARD("공연자는 카드를 사용할 수 없습니다."),
    CARD_NOT_FOUND("존재하지 않는 카드입니다."),
    CARD_ASSIGNMENT_NOT_FOUND("존재하지 않는 카드 할당입니다."),
    CARD_NOT_ASSIGNED("배정받지 않은 카드입니다."),
    CARD_ALREADY_USED("이미 사용한 카드입니다."),
    CARD_ALREADY_PENDING("해당 카드는 이미 발동 대기 중입니다."),
    INVALID_CARD_STATE("현재 사용할 수 없는 카드 상태입니다."),
    CARD_CONFIGURATION_INVALID("카드 효과 설정이 올바르지 않습니다."),
    CARD_ACTIVATION_PENDING("다른 카드가 이미 발동 대기 중입니다."),
    CARD_EFFECT_ALREADY_ACTIVE("다른 카드 효과가 적용 중입니다."),
    CARD_STATE_CONFLICT("카드 상태가 일치하지 않습니다."),
    INVALID_CARD_TARGET("카드 효과 대상을 결정할 수 없습니다."),

    /*
     * 서버 내부 오류
     */
    INTERNAL_SERVER_ERROR("서버 내부 오류가 발생했습니다.");

    private final String defaultMessage;

    WebSocketErrorCode(String defaultMessage) {
        this.defaultMessage = defaultMessage;
    }
}
