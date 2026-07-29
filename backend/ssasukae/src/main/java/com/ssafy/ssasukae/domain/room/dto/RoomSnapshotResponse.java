package com.ssafy.ssasukae.domain.room.dto;

import java.util.List;

import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;

public record RoomSnapshotResponse(
    String name,
    RoomMode mode,
    RoomStatus status,
    Long hostUserId,
    Integer maxParticipants,
    List<RoomParticipantResponse> participants) {

  public static RoomSnapshotResponse from(
      Room room, List<RoomParticipant> participants) {
    return new RoomSnapshotResponse(
        room.getName(),
        room.getMode(),
        room.getStatus(),
        room.getHost().getId(),
        room.getMaxParticipants(),
        participants.stream().map(RoomParticipantResponse::from).toList());
  }
}
