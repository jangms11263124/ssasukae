package com.ssafy.ssasukae.global.security.websocket;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

class WebSocketSessionCloserTest {

  @Test
  void closesReplacedSessionWithCustomCloseStatus() throws Exception {
    WebSocketSession session = mock(WebSocketSession.class);
    when(session.getId()).thenReturn("ws-old");
    when(session.isOpen()).thenReturn(true);

    WebSocketSessionCloser closer = new WebSocketSessionCloser();
    closer.register(session);
    closer.closeReplacedSessions(Set.of("ws-old"));

    verify(session)
        .close(
            argThat(
                status ->
                    status.getCode()
                            == WebSocketSessionCloser.SESSION_REPLACED_CLOSE_CODE
                        && WebSocketSessionCloser.SESSION_REPLACED_REASON.equals(
                            status.getReason())));
  }
}
