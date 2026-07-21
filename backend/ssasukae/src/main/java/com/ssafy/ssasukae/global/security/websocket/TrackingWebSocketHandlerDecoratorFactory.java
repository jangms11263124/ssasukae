package com.ssafy.ssasukae.global.security.websocket;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.handler.WebSocketHandlerDecoratorFactory;

@Component
public class TrackingWebSocketHandlerDecoratorFactory
    implements WebSocketHandlerDecoratorFactory {

  private final WebSocketSessionCloser webSocketSessionCloser;

  public TrackingWebSocketHandlerDecoratorFactory(
      WebSocketSessionCloser webSocketSessionCloser) {
    this.webSocketSessionCloser = webSocketSessionCloser;
  }

  @Override
  public WebSocketHandler decorate(WebSocketHandler handler) {
    return new WebSocketHandlerDecorator(handler) {
      @Override
      public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        webSocketSessionCloser.register(session);
        try {
          super.afterConnectionEstablished(session);
        } catch (Exception exception) {
          webSocketSessionCloser.unregister(session.getId());
          throw exception;
        }
      }

      @Override
      public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus)
          throws Exception {
        try {
          super.afterConnectionClosed(session, closeStatus);
        } finally {
          webSocketSessionCloser.unregister(session.getId());
        }
      }
    };
  }
}
