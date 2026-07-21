package com.ssafy.ssasukae.domain.realtime.publisher;

import com.ssafy.ssasukae.domain.realtime.event.RealtimeEvent;
import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventFactory;
import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
public class RoomRealtimeEventPublisher {

  private final SimpMessagingTemplate messagingTemplate;
  private final RealtimeEventFactory eventFactory;

  public RoomRealtimeEventPublisher(
      SimpMessagingTemplate messagingTemplate, RealtimeEventFactory eventFactory) {
    this.messagingTemplate = messagingTemplate;
    this.eventFactory = eventFactory;
  }

  public <T> void publishRoomEvent(
      Long roomId, long version, RealtimeEventType type, T data) {
    RealtimeEvent<T> event = eventFactory.create(type, roomId, version, data);
    messagingTemplate.convertAndSend("/topic/rooms/" + roomId, event);
  }

  public <T> void publishUserEvent(
      Long userId,
      String destination,
      Long roomId,
      long version,
      RealtimeEventType type,
      T data) {
    RealtimeEvent<T> event = eventFactory.create(type, roomId, version, data);
    messagingTemplate.convertAndSendToUser(userId.toString(), destination, event);
  }
}
