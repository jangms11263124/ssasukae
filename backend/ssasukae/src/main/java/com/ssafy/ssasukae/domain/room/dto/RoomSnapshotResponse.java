package com.ssafy.ssasukae.domain.room.dto;

import java.time.OffsetDateTime;
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
    OffsetDateTime serverNow,
    List<RoomParticipantResponse> participants,
    PerformanceSnapshotResponse performance,
    PlaybackSnapshotResponse playback,
    MyCardSnapshotResponse myCard,
    List<CardUsageStatusResponse> cardUsageStatuses,
    ActiveCardSnapshotResponse activeCard) {

  public static RoomSnapshotResponse from(Room room, List<RoomParticipant> participants) {
    return from(room, participants, OffsetDateTime.now(), null, null, null, List.of(), null);
  }

  public static RoomSnapshotResponse from(
      Room room,
      List<RoomParticipant> participants,
      OffsetDateTime serverNow,
      PerformanceSnapshotResponse performance,
      PlaybackSnapshotResponse playback,
      MyCardSnapshotResponse myCard,
      List<CardUsageStatusResponse> cardUsageStatuses,
      ActiveCardSnapshotResponse activeCard) {
    return new RoomSnapshotResponse(
        room.getName(),
        room.getMode(),
        room.getStatus(),
        room.getHost().getId(),
        room.getMaxParticipants(),
        serverNow,
        participants.stream().map(RoomParticipantResponse::from).toList(),
        performance,
        playback,
        myCard,
        cardUsageStatuses,
        activeCard);
  }
}
