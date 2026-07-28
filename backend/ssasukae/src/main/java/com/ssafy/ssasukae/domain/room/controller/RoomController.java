package com.ssafy.ssasukae.domain.room.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ssafy.ssasukae.domain.room.dto.RoomCreateRequest;
import com.ssafy.ssasukae.domain.room.dto.RoomCreateResponse;
import com.ssafy.ssasukae.domain.room.dto.RoomJoinResponse;
import com.ssafy.ssasukae.domain.room.dto.RoomTokenResponse;
import com.ssafy.ssasukae.domain.room.service.RoomService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService roomService;

    @PostMapping
    public ResponseEntity<RoomCreateResponse> createRoom(
            @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
            @Valid @RequestBody RoomCreateRequest request
    ) {
        RoomCreateResponse response = roomService.createRoom(authenticatedUser.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/invite/{inviteCode}/join")
    public ResponseEntity<RoomJoinResponse> joinRoom(
            @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
            @PathVariable String inviteCode
    ) {
        RoomJoinResponse response = roomService.joinRoom(authenticatedUser.userId(), inviteCode);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{roomId}/token")
    public ResponseEntity<RoomTokenResponse> issueConnectionToken(
            @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
            @PathVariable Long roomId
    ) {
        String token = roomService.issueConnectionToken(authenticatedUser.userId(), roomId);
        return ResponseEntity.ok(new RoomTokenResponse(roomId, token));
    }

    @DeleteMapping("/{roomId}")
    public ResponseEntity<Void> terminateRoom(
            @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
            @PathVariable Long roomId
    ) {
        roomService.terminateRoom(authenticatedUser.userId(), roomId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{roomId}/leave")
    public ResponseEntity<Void> leaveRoom(
            @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
            @PathVariable Long roomId
    ) {
        roomService.leaveRoom(authenticatedUser.userId(), roomId);
        return ResponseEntity.noContent().build();
    }
}
