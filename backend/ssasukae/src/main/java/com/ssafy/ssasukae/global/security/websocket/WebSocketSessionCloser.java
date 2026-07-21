package com.ssafy.ssasukae.global.security.websocket;

import java.io.IOException;
import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

@Component
public class WebSocketSessionCloser {

  public static final int SESSION_REPLACED_CLOSE_CODE = 4001;
  public static final String SESSION_REPLACED_REASON = "SESSION_REPLACED";
  public static final int KICKED_CLOSE_CODE = 4003;
  public static final String KICKED_REASON = "KICKED";

  private static final CloseStatus SESSION_REPLACED_CLOSE_STATUS =
      new CloseStatus(SESSION_REPLACED_CLOSE_CODE, SESSION_REPLACED_REASON);
  private static final CloseStatus KICKED_CLOSE_STATUS =
      new CloseStatus(KICKED_CLOSE_CODE, KICKED_REASON);

  private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

  public void register(WebSocketSession session) {
    sessions.put(session.getId(), session);
  }

  public void unregister(String sessionId) {
    sessions.remove(sessionId);
  }

  public void closeReplacedSessions(Collection<String> sessionIds) {
    closeSessions(sessionIds, SESSION_REPLACED_CLOSE_STATUS);
  }

  public void closeKickedSessions(Collection<String> sessionIds) {
    closeSessions(sessionIds, KICKED_CLOSE_STATUS);
  }

  private void closeSessions(Collection<String> sessionIds, CloseStatus closeStatus) {
    for (String sessionId : sessionIds) {
      closeSession(sessionId, closeStatus);
    }
  }

  private void closeSession(String sessionId, CloseStatus closeStatus) {
    WebSocketSession session = sessions.get(sessionId);
    if (session == null || !session.isOpen()) {
      return;
    }

    try {
      session.close(closeStatus);
    } catch (IOException ignored) {
      // 연결이 이미 종료되는 중이어도 Registry 정리는 afterConnectionClosed에서 수행된다.
    }
  }
}
