package com.ssafy.ssasukae.global.exception.room;

import com.ssafy.ssasukae.global.exception.BaseErrorCode;

import org.springframework.http.HttpStatus;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum RoomErrorCode implements BaseErrorCode {

    // 방 상태
    ROOM_CLOSED(HttpStatus.CONFLICT, "이미 종료된 방입니다."),
    ROOM_NOT_JOINABLE(HttpStatus.CONFLICT, "현재 입장할 수 없는 방입니다."),
    ROOM_FULL(HttpStatus.CONFLICT, "방 정원이 가득 찼습니다."),

    // 공연 상태
    ROOM_NOT_READY_FOR_PERFORMANCE(HttpStatus.CONFLICT, "공연을 시작할 수 없는 방 상태입니다."),
    ROOM_NOT_PLAYING(HttpStatus.CONFLICT, "현재 공연 중인 방이 아닙니다."),

    // 참가자 상태
    REENTRY_BANNED(HttpStatus.FORBIDDEN, "강퇴된 참가자는 다시 입장할 수 없습니다."),
    PARTICIPANT_NOT_ACTIVE(HttpStatus.CONFLICT, "활성 상태의 참가자가 아닙니다."),
    PARTICIPANT_MUST_BE_ONLINE(HttpStatus.CONFLICT, "온라인 상태의 참가자만 수행할 수 있습니다."),

    // 리소스 조회 및 권한
    ROOM_NOT_FOUND(HttpStatus.NOT_FOUND, "존재하지 않는 방입니다."),
    PARTICIPANT_NOT_FOUND(HttpStatus.NOT_FOUND, "존재하지 않는 참가자입니다."),
    ALREADY_JOINED(HttpStatus.CONFLICT, "이미 참가 중인 방입니다."),
    ALREADY_IN_ANOTHER_ROOM(HttpStatus.CONFLICT, "이미 다른 방에 참여 중입니다."),
    HOST_ONLY(HttpStatus.FORBIDDEN, "방장만 수행할 수 있는 요청입니다."),

    // 인프라 연동 실패
    INVITE_CODE_GENERATION_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "초대 코드를 생성하지 못했습니다."),
    MEDIA_SESSION_OPERATION_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "화상 세션 처리 중 오류가 발생했습니다.");

    private final HttpStatus httpStatus;
    private final String message;
}
