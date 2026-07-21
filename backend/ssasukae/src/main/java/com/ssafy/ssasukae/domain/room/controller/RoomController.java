package com.ssafy.ssasukae.domain.room.controller;

import java.net.URI;

import com.ssafy.ssasukae.domain.room.dto.CreateRoomRequest;
import com.ssafy.ssasukae.domain.room.dto.CreateRoomResponse;
import com.ssafy.ssasukae.domain.room.dto.JoinRoomRequest;
import com.ssafy.ssasukae.domain.room.dto.JoinRoomResponse;
import com.ssafy.ssasukae.domain.room.dto.RoomSnapshotResponse;
import com.ssafy.ssasukae.domain.room.service.RoomService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/rooms")
@Validated
public class RoomController {

  private final RoomService roomService;

  public RoomController(RoomService roomService) {
    this.roomService = roomService;
  }

  @PostMapping
  public ResponseEntity<CreateRoomResponse> createRoom(
      @RequestHeader("Idempotency-Key") @NotBlank String idempotencyKey,
      @Valid @RequestBody CreateRoomRequest request,
      @AuthenticationPrincipal AuthenticatedUser user) {
    CreateRoomResponse response = roomService.createRoom(user.userId(), request);
    return ResponseEntity.created(URI.create("/api/v1/rooms/" + response.roomId())).body(response);
  }

  @PostMapping("/join")
  public ResponseEntity<JoinRoomResponse> joinRoom(
      @RequestHeader("Idempotency-Key") @NotBlank String idempotencyKey,
      @Valid @RequestBody JoinRoomRequest request,
      @AuthenticationPrincipal AuthenticatedUser user) {
    return ResponseEntity.ok(roomService.joinRoom(user.userId(), request));
  }

  @GetMapping("/{roomId}")
  public ResponseEntity<RoomSnapshotResponse> getRoom(
      @PathVariable Long roomId, @AuthenticationPrincipal AuthenticatedUser user) {
    return ResponseEntity.ok(roomService.getRoomSnapshot(roomId, user.userId()));
  }
}
