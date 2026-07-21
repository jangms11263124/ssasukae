package com.ssafy.ssasukae.config;

import com.ssafy.ssasukae.global.security.websocket.StompJwtAuthenticationInterceptor;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration(proxyBeanMethods = false)
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

  public static final String ENDPOINT = "/ws";
  private static final long HEARTBEAT_INTERVAL_MILLIS = 10_000L;

  private final StompJwtAuthenticationInterceptor stompJwtAuthenticationInterceptor;
  private final TaskScheduler heartbeatTaskScheduler;

  public WebSocketConfig(
      StompJwtAuthenticationInterceptor stompJwtAuthenticationInterceptor,
      @Qualifier("roomWebSocketHeartbeatTaskScheduler")
          TaskScheduler heartbeatTaskScheduler) {
    this.stompJwtAuthenticationInterceptor = stompJwtAuthenticationInterceptor;
    this.heartbeatTaskScheduler = heartbeatTaskScheduler;
  }

  @Override
  public void configureMessageBroker(MessageBrokerRegistry registry) {
    registry
        .enableSimpleBroker("/topic", "/queue")
        .setHeartbeatValue(
            new long[] {HEARTBEAT_INTERVAL_MILLIS, HEARTBEAT_INTERVAL_MILLIS})
        .setTaskScheduler(heartbeatTaskScheduler);
    registry.setApplicationDestinationPrefixes("/app");
    registry.setUserDestinationPrefix("/user");
    registry.setPreservePublishOrder(true);
  }

  @Override
  public void registerStompEndpoints(StompEndpointRegistry registry) {
    registry
        .addEndpoint(ENDPOINT)
        .setAllowedOrigins("http://localhost:3000", "http://127.0.0.1:3000");
  }

  @Override
  public void configureClientInboundChannel(ChannelRegistration registration) {
    registration.interceptors(stompJwtAuthenticationInterceptor);
  }
}
