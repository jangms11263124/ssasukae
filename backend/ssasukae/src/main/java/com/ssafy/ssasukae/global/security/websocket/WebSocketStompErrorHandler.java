package com.ssafy.ssasukae.global.security.websocket;


import com.ssafy.ssasukae.global.exception.websocket.WebSocketErrorCode;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketErrorResponse;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.NonNull;
import org.springframework.lang.Nullable;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Component;
import org.springframework.util.MimeTypeUtils;
import org.springframework.web.socket.messaging.StompSubProtocolErrorHandler;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketStompErrorHandler
        extends StompSubProtocolErrorHandler {

  private final ObjectMapper objectMapper;

  /**
   * ChannelInterceptor 또는 STOMP 프레임 처리 과정에서 발생한 예외를
   * STOMP ERROR 프레임으로 변환한다.
   */
  @Override
  public Message<byte[]> handleClientMessageProcessingError(
          @Nullable Message<byte[]> clientMessage,
          @NonNull Throwable exception
  ) {
    WebSocketException webSocketException =
            findWebSocketException(exception);

    WebSocketErrorResponse response;

    if (webSocketException != null) {
      response = WebSocketErrorResponse.from(webSocketException);

      log.warn(
              "STOMP 요청이 거부되었습니다. code={}, message={}",
              webSocketException.getErrorCode(),
              webSocketException.getMessage()
      );
    } else {
      log.error(
              "STOMP 메시지 처리 중 예상하지 못한 오류가 발생했습니다.",
              exception
      );

      response = WebSocketErrorResponse.of(
              WebSocketErrorCode.INTERNAL_SERVER_ERROR
      );
    }

    StompHeaderAccessor errorAccessor =
            StompHeaderAccessor.create(StompCommand.ERROR);

    errorAccessor.setContentType(MimeTypeUtils.APPLICATION_JSON);
    errorAccessor.setMessage(response.payload().message());
    errorAccessor.setLeaveMutable(true);

    copyReceiptId(clientMessage, errorAccessor);

    return MessageBuilder.createMessage(
            serialize(response),
            errorAccessor.getMessageHeaders()
    );
  }

  /**
   * Spring Messaging이 예외를 MessageDeliveryException 등으로
   * 감쌀 수 있으므로 원인 체인에서 WebSocketException을 찾는다.
   */
  @Nullable
  private WebSocketException findWebSocketException(
          Throwable exception
  ) {
    Throwable current = exception;

    while (current != null) {
      if (current instanceof WebSocketException webSocketException) {
        return webSocketException;
      }

      if (current.getCause() == current) {
        break;
      }

      current = current.getCause();
    }

    return null;
  }

  /**
   * 클라이언트가 receipt 헤더를 보낸 경우
   * ERROR 프레임에 receipt-id를 설정한다.
   */
  private void copyReceiptId(
          @Nullable Message<byte[]> clientMessage,
          StompHeaderAccessor errorAccessor
  ) {
    if (clientMessage == null) {
      return;
    }

    StompHeaderAccessor clientAccessor =
            StompHeaderAccessor.wrap(clientMessage);

    String receiptId = clientAccessor.getReceipt();

    if (receiptId != null) {
      errorAccessor.setReceiptId(receiptId);
    }
  }

  private byte[] serialize(WebSocketErrorResponse response) {
      return objectMapper.writeValueAsBytes(response);
  }
}