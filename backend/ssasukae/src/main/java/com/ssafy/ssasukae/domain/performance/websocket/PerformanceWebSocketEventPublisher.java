package com.ssafy.ssasukae.domain.performance.websocket;

import org.springframework.stereotype.Component;

import com.ssafy.ssasukae.global.websocket.message.WebSocketEvent;
import com.ssafy.ssasukae.global.websocket.publisher.WebSocketEventPublisher;

@Component
public class PerformanceWebSocketEventPublisher {

    private final WebSocketEventPublisher eventPublisher;

    public PerformanceWebSocketEventPublisher(WebSocketEventPublisher eventPublisher) {
        this.eventPublisher = eventPublisher;
    }

    public void publish(
            Long roomId,
            PerformanceWebSocketEventType eventType,
            Object payload) {
        eventPublisher.publishToRoom(roomId, WebSocketEvent.roomEvent(eventType, roomId, payload));
    }
}
