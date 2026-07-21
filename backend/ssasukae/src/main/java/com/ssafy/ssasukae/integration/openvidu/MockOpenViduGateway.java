package com.ssafy.ssasukae.integration.openvidu;

import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    prefix = "openvidu",
    name = "mock-enabled",
    havingValue = "true",
    matchIfMissing = true)
public class MockOpenViduGateway implements MediaSessionGateway {

  @Override
  public String createSession() {
    return "mock-session-" + UUID.randomUUID();
  }

  @Override
  public String createConnectionToken(String sessionId, Long participantId) {
    return "mock-token-"
        + sessionId
        + "-participant-"
        + participantId
        + "-"
        + UUID.randomUUID();
  }

  @Override
  public void closeSession(String sessionId) {
    // 로컬 Mock에서는 실제 미디어 세션 자원이 없으므로 종료할 작업이 없습니다.
  }
}
