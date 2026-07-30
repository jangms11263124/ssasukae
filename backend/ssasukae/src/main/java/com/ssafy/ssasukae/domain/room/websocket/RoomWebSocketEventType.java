package com.ssafy.ssasukae.domain.room.websocket;

import com.ssafy.ssasukae.global.websocket.message.WebSocketEventType;

public enum RoomWebSocketEventType implements WebSocketEventType {
  // 사용자 참가
  PARTICIPANT_JOINED,
  // 참가자 방 떠남
  PARTICIPANT_LEFT,
  // 방장 바뀜
  ROOM_HOST_CHANGED,
  // 참가자 추방
  PARTICIPANT_KICKED,
  // 참가자 연결 상태 변경
  PARTICIPANT_CONNECTION_STATUS_CHANGED,
  // 방 종료
  ROOM_TERMINATED,
  // 참가자 채팅
  PARTICIPANT_CHAT;

  @Override
  public String value() {
    return name();
  }
}
