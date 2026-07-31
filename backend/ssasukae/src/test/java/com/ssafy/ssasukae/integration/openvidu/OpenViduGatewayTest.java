package com.ssafy.ssasukae.integration.openvidu;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.room.RoomErrorCode;

import io.openvidu.java.client.Connection;
import io.openvidu.java.client.ConnectionProperties;
import io.openvidu.java.client.OpenVidu;
import io.openvidu.java.client.Session;
import io.openvidu.java.client.SessionProperties;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OpenViduGatewayTest {

  @Mock private OpenVidu openVidu;
  @Mock private Session session;
  @Mock private Connection connection;

  private OpenViduGateway openViduGateway;

  @BeforeEach
  void setUp() {
    openViduGateway = new OpenViduGateway(openVidu);
  }

  @Test
  @DisplayName("세션을 생성하면 OpenVidu SDK가 발급한 세션 ID를 그대로 반환한다")
  void createSession_returnsSessionIdFromSdk() throws Exception {
    // given
    when(session.getSessionId()).thenReturn("openvidu-session-1");
    when(openVidu.createSession(any(SessionProperties.class))).thenReturn(session);

    // when
    String sessionId = openViduGateway.createSession();

    // then
    assertThat(sessionId).isEqualTo("openvidu-session-1");
  }

  @Test
  @DisplayName("활성 세션 목록에서 sessionId가 일치하는 세션을 찾아 연결 토큰을 발급한다")
  void createConnectionToken_issuesTokenForMatchingActiveSession() throws Exception {
    // given
    when(session.getSessionId()).thenReturn("openvidu-session-1");
    when(openVidu.getActiveSessions()).thenReturn(List.of(session));
    when(session.createConnection(any(ConnectionProperties.class))).thenReturn(connection);
    when(connection.getToken()).thenReturn("openvidu-token-1");

    // when
    String token = openViduGateway.createConnectionToken("openvidu-session-1", 100L);

    // then
    assertThat(token).isEqualTo("openvidu-token-1");
    verify(openVidu).fetch();
  }

  @Test
  @DisplayName("활성 세션 목록에 sessionId가 없으면 연결 토큰 발급에 실패한다")
  void createConnectionToken_throwsWhenSessionNotActive() throws Exception {
    // given
    when(openVidu.getActiveSessions()).thenReturn(List.of());

    // when & then
    assertThatThrownBy(() -> openViduGateway.createConnectionToken("openvidu-session-1", 100L))
        .isInstanceOf(CustomException.class)
        .hasMessage(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED.getMessage());
  }

  @Test
  @DisplayName("활성 세션 목록에서 sessionId가 일치하는 세션을 찾아 종료한다")
  void disconnect_forcesDisconnectForMatchingConnection() throws Exception {
    // given
    when(session.getSessionId()).thenReturn("openvidu-session-1");
    when(openVidu.getActiveSessions()).thenReturn(List.of(session));

    // when
    openViduGateway.disconnect("openvidu-session-1", "connection-1");

    // then
    verify(session).forceDisconnect("connection-1");
  }

  @Test
  @DisplayName("활성 세션 목록에 sessionId가 없으면 참가자 연결 종료에 실패한다")
  void disconnect_throwsWhenSessionNotActive() throws Exception {
    // given
    when(openVidu.getActiveSessions()).thenReturn(List.of());

    // when & then
    assertThatThrownBy(
            () -> openViduGateway.disconnect("openvidu-session-1", "connection-1"))
        .isInstanceOf(CustomException.class)
        .hasMessage(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED.getMessage());
  }

  @Test
  @DisplayName("활성 세션 목록에서 sessionId가 일치하는 세션을 찾아 종료한다")
  void closeSession_closesMatchingActiveSession() throws Exception {
    // given
    when(session.getSessionId()).thenReturn("openvidu-session-1");
    when(openVidu.getActiveSessions()).thenReturn(List.of(session));

    // when
    openViduGateway.closeSession("openvidu-session-1");

    // then
    verify(session).close();
  }

  @Test
  @DisplayName("활성 세션 목록에 sessionId가 없으면 세션 종료에 실패한다")
  void closeSession_throwsWhenSessionNotActive() throws Exception {
    // given
    when(openVidu.getActiveSessions()).thenReturn(List.of());

    // when & then
    assertThatThrownBy(() -> openViduGateway.closeSession("openvidu-session-1"))
        .isInstanceOf(CustomException.class)
        .hasMessage(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED.getMessage());
  }
}
