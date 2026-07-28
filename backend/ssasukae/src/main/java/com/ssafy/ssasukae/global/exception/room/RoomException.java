package com.ssafy.ssasukae.global.exception.room;

import lombok.Getter;

@Getter
public class RoomException extends RuntimeException {

    private final RoomErrorCode errorCode;

    private RoomException(RoomErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    public static RoomException closed() {
        return new RoomException(RoomErrorCode.ROOM_CLOSED);
    }

    public static RoomException notJoinable() {
        return new RoomException(RoomErrorCode.ROOM_NOT_JOINABLE);
    }

    public static RoomException full() {
        return new RoomException(RoomErrorCode.ROOM_FULL);
    }

    public static RoomException notReadyForPerformance() {
        return new RoomException(RoomErrorCode.ROOM_NOT_READY_FOR_PERFORMANCE);
    }

    public static RoomException notPlaying() {
        return new RoomException(RoomErrorCode.ROOM_NOT_PLAYING);
    }

    public static RoomException reentryBanned() {
        return new RoomException(RoomErrorCode.REENTRY_BANNED);
    }

    public static RoomException participantNotActive() {
        return new RoomException(RoomErrorCode.PARTICIPANT_NOT_ACTIVE);
    }

    public static RoomException participantMustBeOnline() {
        return new RoomException(RoomErrorCode.PARTICIPANT_MUST_BE_ONLINE);
    }

    public static RoomException notFound() {
        return new RoomException(RoomErrorCode.ROOM_NOT_FOUND);
    }

    public static RoomException participantNotFound() {
        return new RoomException(RoomErrorCode.PARTICIPANT_NOT_FOUND);
    }

    public static RoomException alreadyJoined() {
        return new RoomException(RoomErrorCode.ALREADY_JOINED);
    }

    public static RoomException hostOnly() {
        return new RoomException(RoomErrorCode.HOST_ONLY);
    }
}
