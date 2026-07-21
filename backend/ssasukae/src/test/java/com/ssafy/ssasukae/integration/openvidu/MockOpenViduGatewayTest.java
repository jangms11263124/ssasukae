package com.ssafy.ssasukae.integration.openvidu;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MockOpenViduGatewayTest {

  private final MockOpenViduGateway gateway = new MockOpenViduGateway();

  @Test
  void createsMockSessionAndConnectionToken() {
    String sessionId = gateway.createSession();
    String token = gateway.createConnectionToken(sessionId, 1001L);

    assertThat(sessionId).startsWith("mock-session-");
    assertThat(token).contains(sessionId).contains("participant-1001");
  }
}
