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
}
