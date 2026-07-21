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

  private static final CloseStatus SESSION_REPLACED_CLOSE_STATUS =
      new CloseStatus(SESSION_REPLACED_CLOSE_CODE, SESSION_REPLACED_REASON);

  private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

  public void register(WebSocketSession session) {
    sessions.put(session.getId(), session);
  }

  public void unregister(String sessionId) {
    sessions.remove(sessionId);
  }

  public void closeReplacedSessions(Collection<String> sessionIds) {
    for (String sessionId : sessionIds) {
      closeReplacedSession(sessionId);
    }
  }

  private void closeReplacedSession(String sessionId) {
    WebSocketSession session = sessions.get(sessionId);
    if (session == null || !session.isOpen()) {
      return;
    }

    try {
      session.close(SESSION_REPLACED_CLOSE_STATUS);
    } catch (IOException ignored) {
      // 연결이 이미 종료되는 중이어도 Registry 정리는 afterConnectionClosed에서 수행된다.
    }
  }
}
