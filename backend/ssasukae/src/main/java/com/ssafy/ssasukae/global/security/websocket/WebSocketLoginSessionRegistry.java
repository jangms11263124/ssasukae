package com.ssafy.ssasukae.global.security.websocket;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

@Component
public class WebSocketLoginSessionRegistry {

  private final Map<String, LoginSession> loginSessionByWebSocketSessionId = new HashMap<>();
  private final Map<LoginSession, Set<String>> webSocketSessionIdsByLoginSession =
      new HashMap<>();
  private final Set<String> replacedWebSocketSessionIds = new HashSet<>();

  public synchronized void register(String webSocketSessionId, Long userId, String sid) {
    LoginSession requested = new LoginSession(userId, sid);
    LoginSession existing = loginSessionByWebSocketSessionId.get(webSocketSessionId);

    if (existing != null) {
      if (!existing.equals(requested)) {
        throw new IllegalStateException(
            "하나의 WebSocket 세션에 서로 다른 로그인 세션을 등록할 수 없습니다.");
      }
      return;
    }

    loginSessionByWebSocketSessionId.put(webSocketSessionId, requested);
    webSocketSessionIdsByLoginSession
        .computeIfAbsent(requested, ignored -> new HashSet<>())
        .add(webSocketSessionId);
  }

  /**
   * 현재 연결을 제외하고 동일 사용자의 기존 WebSocket 연결을 모두 교체 대상으로 표시한다.
   * sid가 같더라도 방에서는 사용자당 WebSocket 연결 하나만 허용한다.
   */
  public synchronized Set<String> markOtherSessionsForReplacement(
      String currentWebSocketSessionId) {
    LoginSession current = loginSessionByWebSocketSessionId.get(currentWebSocketSessionId);
    if (current == null) {
      throw new IllegalStateException("등록되지 않은 WebSocket 세션입니다.");
    }

    Set<String> replacedSessionIds = new HashSet<>();
    for (Map.Entry<LoginSession, Set<String>> entry :
        webSocketSessionIdsByLoginSession.entrySet()) {
      if (entry.getKey().userId().equals(current.userId())) {
        replacedSessionIds.addAll(entry.getValue());
      }
    }

    replacedSessionIds.remove(currentWebSocketSessionId);
    replacedWebSocketSessionIds.addAll(replacedSessionIds);
    return Set.copyOf(replacedSessionIds);
  }

  @Deprecated(forRemoval = false)
  public synchronized Set<String> markOtherLoginSessionsForReplacement(
      String currentWebSocketSessionId) {
    return markOtherSessionsForReplacement(currentWebSocketSessionId);
  }

  public synchronized Unregistration unregister(String webSocketSessionId) {
    boolean replaced = replacedWebSocketSessionIds.remove(webSocketSessionId);
    LoginSession loginSession = loginSessionByWebSocketSessionId.remove(webSocketSessionId);
    if (loginSession == null) {
      return new Unregistration(replaced);
    }

    Set<String> sessionIds = webSocketSessionIdsByLoginSession.get(loginSession);
    if (sessionIds != null) {
      sessionIds.remove(webSocketSessionId);
      if (sessionIds.isEmpty()) {
        webSocketSessionIdsByLoginSession.remove(loginSession);
      }
    }

    return new Unregistration(replaced);
  }

  private record LoginSession(Long userId, String sid) {

    private LoginSession {
      if (userId == null || sid == null || sid.isBlank()) {
        throw new IllegalArgumentException("userId와 sid는 필수입니다.");
      }
    }
  }

  public record Unregistration(boolean replaced) {}
}
