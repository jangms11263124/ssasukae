package com.ssafy.ssasukae.domain.room.websocket;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

@Component
public class RoomWebSocketSessionRegistry {

  private final Map<String, ParticipantKey> participantBySessionId = new HashMap<>();
  private final Map<ParticipantKey, Set<String>> sessionIdsByParticipant = new HashMap<>();

  public synchronized Registration register(String sessionId, Long roomId, Long userId) {
    ParticipantKey key = new ParticipantKey(roomId, userId);
    ParticipantKey existing = participantBySessionId.get(sessionId);

    if (existing != null) {
      if (!existing.equals(key)) {
        throw new IllegalStateException("하나의 WebSocket 세션은 하나의 방에만 연결할 수 있습니다.");
      }
      return new Registration(roomId, userId, false, false);
    }

    Set<String> sessionIds =
        sessionIdsByParticipant.computeIfAbsent(key, ignored -> new HashSet<>());
    boolean firstSession = sessionIds.isEmpty();
    sessionIds.add(sessionId);
    participantBySessionId.put(sessionId, key);

    return new Registration(roomId, userId, true, firstSession);
  }

  public synchronized Set<String> findSessionIds(Long roomId, Long userId) {
    Set<String> sessionIds = sessionIdsByParticipant.get(new ParticipantKey(roomId, userId));
    return sessionIds == null ? Set.of() : Set.copyOf(sessionIds);
  }

  public synchronized Unregistration unregister(String sessionId) {
    ParticipantKey key = participantBySessionId.remove(sessionId);
    if (key == null) {
      return null;
    }

    Set<String> sessionIds = sessionIdsByParticipant.get(key);
    if (sessionIds == null) {
      return new Unregistration(key.roomId(), key.userId(), true);
    }

    sessionIds.remove(sessionId);
    boolean lastSession = sessionIds.isEmpty();
    if (lastSession) {
      sessionIdsByParticipant.remove(key);
    }

    return new Unregistration(key.roomId(), key.userId(), lastSession);
  }

  private record ParticipantKey(Long roomId, Long userId) {}

  public record Registration(
      Long roomId, Long userId, boolean newSession, boolean firstSession) {}

  public record Unregistration(Long roomId, Long userId, boolean lastSession) {}
}
