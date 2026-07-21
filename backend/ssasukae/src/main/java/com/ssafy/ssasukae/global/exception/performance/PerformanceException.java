package com.ssafy.ssasukae.global.exception.performance;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

import org.springframework.http.HttpStatus;

public class PerformanceException extends RuntimeException {

  private final HttpStatus status;
  private final String errorCode;

  private PerformanceException(HttpStatus status, String errorCode, String message) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }

  public static PerformanceException hostPermissionRequired() {
    return new PerformanceException(
        HttpStatus.FORBIDDEN,
        "HOST_PERMISSION_REQUIRED",
        "방장만 공연을 시작할 수 있습니다.");
  }

  public static PerformanceException requesterNotOnline() {
    return new PerformanceException(
        HttpStatus.CONFLICT,
        "REQUESTER_NOT_ONLINE",
        "온라인 상태의 참가자만 공연 명령을 실행할 수 있습니다.");
  }

  public static PerformanceException performerNotFound() {
    return new PerformanceException(
        HttpStatus.NOT_FOUND,
        "PERFORMER_NOT_FOUND",
        "해당 방에서 공연자를 찾을 수 없습니다.");
  }

  public static PerformanceException performerNotOnline() {
    return new PerformanceException(
        HttpStatus.CONFLICT,
        "PARTICIPANT_NOT_ONLINE",
        "온라인 상태의 참가자만 공연자가 될 수 있습니다.");
  }

  public static PerformanceException songNotFound() {
    return new PerformanceException(
        HttpStatus.NOT_FOUND, "SONG_NOT_FOUND", "존재하지 않는 곡입니다.");
  }

  public static PerformanceException songNotReady() {
    return new PerformanceException(
        HttpStatus.CONFLICT, "SONG_NOT_READY", "아직 공연할 수 없는 상태의 곡입니다.");
  }

  public static PerformanceException alreadyActive() {
    return new PerformanceException(
        HttpStatus.CONFLICT,
        "PERFORMANCE_ALREADY_ACTIVE",
        "해당 방에 이미 진행 중인 공연이 있습니다.");
  }

  public static PerformanceException notFound() {
    return new PerformanceException(
        HttpStatus.NOT_FOUND, "PERFORMANCE_NOT_FOUND", "해당 방에서 공연을 찾을 수 없습니다.");
  }

  public static PerformanceException playbackPermissionRequired() {
    return new PerformanceException(
        HttpStatus.FORBIDDEN,
        "PLAYBACK_PERMISSION_REQUIRED",
        "현재 공연자만 재생을 시작하거나 종료할 수 있습니다.");
  }

  public static PerformanceException cancelPermissionRequired() {
    return new PerformanceException(
        HttpStatus.FORBIDDEN,
        "PERFORMANCE_CANCEL_PERMISSION_REQUIRED",
        "방장 또는 현재 공연자만 공연을 취소할 수 있습니다.");
  }

  public static PerformanceException invalidState(
      PerformanceStatus currentStatus, PerformanceStatus targetStatus) {
    return new PerformanceException(
        HttpStatus.CONFLICT,
        "INVALID_PERFORMANCE_STATE",
        "공연 상태를 " + currentStatus + "에서 " + targetStatus + "(으)로 변경할 수 없습니다.");
  }

  public static PerformanceException roomNotPlaying() {
    return new PerformanceException(
        HttpStatus.CONFLICT,
        "ROOM_NOT_PLAYING",
        "공연 상태를 변경할 수 있는 방 상태가 아닙니다.");
  }

  public HttpStatus getStatus() {
    return status;
  }

  public String getErrorCode() {
    return errorCode;
  }
}
