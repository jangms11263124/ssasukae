package com.ssafy.ssasukae.global.exception.room;

import org.springframework.http.HttpStatus;

public class RoomException extends RuntimeException {

  private final HttpStatus status;
  private final String errorCode;

  private RoomException(HttpStatus status, String errorCode, String message) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }

  public static RoomException invalidSetting(String message) {
    return new RoomException(HttpStatus.BAD_REQUEST, "INVALID_ROOM_SETTING", message);
  }

  public static RoomException alreadyInActiveRoom() {
    return new RoomException(
        HttpStatus.CONFLICT,
        "USER_ALREADY_IN_ACTIVE_ROOM",
        "이미 참여 중인 활성 방이 있습니다.");
  }

  public static RoomException notFound() {
    return new RoomException(HttpStatus.NOT_FOUND, "ROOM_NOT_FOUND", "존재하지 않는 방입니다.");
  }

  public static RoomException inviteCodeNotFound() {
    return new RoomException(
        HttpStatus.NOT_FOUND, "INVITE_CODE_NOT_FOUND", "존재하지 않는 초대 코드입니다.");
  }

  public static RoomException accessDenied() {
    return new RoomException(HttpStatus.FORBIDDEN, "ROOM_ACCESS_DENIED", "방 접근 권한이 없습니다.");
  }

  public static RoomException reentryBanned() {
    return new RoomException(
        HttpStatus.FORBIDDEN, "ROOM_REENTRY_BANNED", "강제 퇴장된 방에는 재입장할 수 없습니다.");
  }

  public static RoomException notJoinable() {
    return new RoomException(
        HttpStatus.CONFLICT, "ROOM_NOT_JOINABLE", "현재 입장할 수 없는 상태의 방입니다.");
  }

  public static RoomException full() {
    return new RoomException(HttpStatus.CONFLICT, "ROOM_FULL", "방의 최대 인원에 도달했습니다.");
  }

  public static RoomException closed() {
    return new RoomException(HttpStatus.GONE, "ROOM_CLOSED", "이미 종료된 방입니다.");
  }

  public static RoomException notActiveParticipant() {
    return new RoomException(
        HttpStatus.CONFLICT, "PARTICIPANT_NOT_ACTIVE", "현재 방에 참여 중인 상태가 아닙니다.");
  }

  public static RoomException hostMustBeOnline() {
    return new RoomException(
        HttpStatus.CONFLICT, "HOST_MUST_BE_ONLINE", "온라인 상태의 참가자만 방장이 될 수 있습니다.");
  }

  public HttpStatus getStatus() {
    return status;
  }

  public String getErrorCode() {
    return errorCode;
  }
}
