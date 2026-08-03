package com.ssafy.ssasukae.global.websocket.ping;

import java.time.OffsetDateTime;
import java.time.ZoneId;

import jakarta.validation.Valid;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.stereotype.Controller;

import com.ssafy.ssasukae.global.websocket.destination.WebSocketDestinations;
import com.ssafy.ssasukae.global.websocket.message.WebSocketEvent;

@Controller
public class PingWebSocketController {

  private static final ZoneId SEOUL_ZONE_ID = ZoneId.of("Asia/Seoul");

  @MessageMapping("/ping")
  @SendToUser(destinations = WebSocketDestinations.USER_PONG_QUEUE, broadcast = false)
  public WebSocketEvent<PongPayload> ping(@Valid @Payload PingRequest request) {
    OffsetDateTime serverReceivedAt = OffsetDateTime.now(SEOUL_ZONE_ID);

    return WebSocketEvent.event(
        SystemWebSocketEventType.PONG,
        new PongPayload(request.clientSentAt(), serverReceivedAt));
  }
}
