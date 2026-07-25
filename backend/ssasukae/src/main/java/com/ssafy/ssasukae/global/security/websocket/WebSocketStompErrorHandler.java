package com.ssafy.ssasukae.global.security.websocket;

import com.ssafy.ssasukae.global.exception.websocket.WebSocketAccessDeniedException;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketAuthenticationException;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.StompSubProtocolErrorHandler;

import java.nio.charset.StandardCharsets;

@Component
public class WebSocketStompErrorHandler extends StompSubProtocolErrorHandler {

  private static final String CONNECTION_FAILED = "WEBSOCKET_CONNECTION_FAILED";

  @Override
  public Message<byte[]> handleClientMessageProcessingError(
      Message<byte[]> clientMessage, Throwable ex) {
    Throwable cause = findCause(ex);

    String errorCode = CONNECTION_FAILED;
    String errorMessage = "WebSocket 연결 처리 중 오류가 발생했습니다.";

    if (cause instanceof WebSocketAuthenticationException authenticationException) {
      errorCode = authenticationException.getErrorCode();
      errorMessage = authenticationException.getMessage();
    } else if (cause instanceof WebSocketAccessDeniedException) {
      errorCode = "WEBSOCKET_ACCESS_DENIED";
      errorMessage = cause.getMessage();
    }

    StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.ERROR);
    accessor.setMessage(errorCode);
    accessor.setLeaveMutable(true);

    return MessageBuilder.createMessage(
        errorMessage.getBytes(StandardCharsets.UTF_8), accessor.getMessageHeaders());
  }

  private Throwable findCause(Throwable throwable) {
    Throwable current = throwable;
    while (current.getCause() != null && current.getCause() != current) {
      current = current.getCause();
    }
    return current;
  }
}
