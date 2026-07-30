package com.ssafy.ssasukae.domain.card.websocket;

import java.security.Principal;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.stereotype.Controller;

import com.ssafy.ssasukae.domain.card.service.CardService;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketAuthenticationException;

@Controller
public class CardWebSocketController {

  private final CardService cardService;

  public CardWebSocketController(CardService cardService) {
    this.cardService = cardService;
  }

  // 카드 발동 명령
  @MessageMapping("/rooms/{roomId}/performances/{performanceId}/cards/activate")
  public void activate(
      @DestinationVariable Long roomId,
      @DestinationVariable Long performanceId,
      Principal principal) {
    cardService.activate(resolveUserId(principal), roomId, performanceId);
  }

  private Long resolveUserId(Principal principal) {
    if (principal == null) {
      throw WebSocketAuthenticationException.unauthorized();
    }
    try {
      return Long.valueOf(principal.getName());
    } catch (NumberFormatException exception) {
      throw WebSocketAuthenticationException.unauthorized();
    }
  }
}
