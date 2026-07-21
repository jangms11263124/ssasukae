package com.ssafy.ssasukae.domain.room.controller;

import java.security.Principal;

import com.ssafy.ssasukae.domain.room.service.RoomService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

@Controller
public class RoomMessageController {

  private final RoomService roomService;

  public RoomMessageController(RoomService roomService) {
    this.roomService = roomService;
  }

  @MessageMapping("/rooms/{roomId}/participants/{participantId}/kick")
  public void kickParticipant(
      @DestinationVariable Long roomId,
      @DestinationVariable Long participantId,
      Principal principal) {
    roomService.kickParticipant(roomId, participantId, resolveUserId(principal));
  }

  private Long resolveUserId(Principal principal) {
    if (principal instanceof Authentication authentication
        && authentication.getPrincipal() instanceof AuthenticatedUser user) {
      return user.userId();
    }
    throw new AuthenticationCredentialsNotFoundException(
        "인증된 WebSocket 사용자 정보를 찾을 수 없습니다.");
  }
}
