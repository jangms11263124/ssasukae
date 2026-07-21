package com.ssafy.ssasukae.config;

import com.ssafy.ssasukae.global.security.websocket.TrackingWebSocketHandlerDecoratorFactory;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

@Configuration(proxyBeanMethods = false)
public class WebSocketTransportConfig implements WebSocketMessageBrokerConfigurer {

  private final TrackingWebSocketHandlerDecoratorFactory decoratorFactory;

  public WebSocketTransportConfig(
      TrackingWebSocketHandlerDecoratorFactory decoratorFactory) {
    this.decoratorFactory = decoratorFactory;
  }

  @Override
  public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
    registration.addDecoratorFactory(decoratorFactory);
  }
}
