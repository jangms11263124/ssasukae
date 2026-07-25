package com.ssafy.ssasukae.config;

import com.ssafy.ssasukae.global.security.websocket.WebSocketAuthenticationInterceptor;
import com.ssafy.ssasukae.global.security.websocket.WebSocketAuthorizationInterceptor;

import java.util.List;

import com.ssafy.ssasukae.global.security.websocket.WebSocketStompErrorHandler;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketMessageBrokerConfig
        implements WebSocketMessageBrokerConfigurer {

  public static final String WEBSOCKET_ENDPOINT = "/ws";
  public static final String APPLICATION_DESTINATION_PREFIX = "/app";
  public static final String USER_DESTINATION_PREFIX = "/user";

  private static final String TOPIC_BROKER_PREFIX = "/topic";
  private static final String QUEUE_BROKER_PREFIX = "/queue";
  private static final long HEARTBEAT_INTERVAL_MILLIS = 10_000L;

  private final CorsProperties corsProperties;
  private final TaskScheduler heartbeatTaskScheduler;

  private final WebSocketAuthenticationInterceptor authenticationInterceptor;
  private final WebSocketAuthorizationInterceptor authorizationInterceptor;
  private final WebSocketStompErrorHandler stompErrorHandler;
  public WebSocketMessageBrokerConfig(
          CorsProperties corsProperties,
          @Qualifier("roomWebSocketHeartbeatTaskScheduler")
          TaskScheduler heartbeatTaskScheduler,
          WebSocketAuthenticationInterceptor authenticationInterceptor,
          WebSocketAuthorizationInterceptor authorizationInterceptor, WebSocketStompErrorHandler stompErrorHandler
  ) {
    this.corsProperties = corsProperties;
    this.heartbeatTaskScheduler = heartbeatTaskScheduler;
    this.authenticationInterceptor = authenticationInterceptor;
    this.authorizationInterceptor = authorizationInterceptor;
    this.stompErrorHandler = stompErrorHandler;
  }

  /**
   * 클라이언트에서 서버로 전달되는 STOMP 메시지에
   * 인증 및 인가 인터셉터를 등록한다.
   */
  @Override
  public void configureClientInboundChannel(ChannelRegistration registration) {
    registration.interceptors(authenticationInterceptor, authorizationInterceptor);
  }

  /**
   * 웹소켓을 관리하는 메세지 브로커를 설정함
   */
  @Override
  public void configureMessageBroker(MessageBrokerRegistry registry) {
    registry
            // /topic이나 /queue는 심플브로커가 관리함
            .enableSimpleBroker(TOPIC_BROKER_PREFIX, QUEUE_BROKER_PREFIX)
            .setHeartbeatValue(
                    new long[] {
                            HEARTBEAT_INTERVAL_MILLIS,
                            HEARTBEAT_INTERVAL_MILLIS
                    })
            .setTaskScheduler(heartbeatTaskScheduler);

    // 서버에서, 해당 경로에 해당하는 @MessageMapping 메서드로 바로 전달됨
    registry.setApplicationDestinationPrefixes(APPLICATION_DESTINATION_PREFIX);

    // 사용자별 실제 큐로, 목적지를 변환
    registry.setUserDestinationPrefix(USER_DESTINATION_PREFIX);

    // 서버가 발행한 메세지 순서 보존
    registry.setPreservePublishOrder(true);
  }

  /**
   * 초기 연결 설정
   */
  @Override
  public void registerStompEndpoints(StompEndpointRegistry registry) {
    // 에러 핸들러 설정
    registry.setErrorHandler(stompErrorHandler);
    // 초기 연결 엔드포인트 설정
    var endpointRegistration = registry.addEndpoint(WEBSOCKET_ENDPOINT);
    // 프론트 경로 허용
    List<String> allowedOrigins = corsProperties.getAllowedOrigins();

    if (allowedOrigins != null && !allowedOrigins.isEmpty()) {
      endpointRegistration.setAllowedOrigins(
              allowedOrigins.toArray(String[]::new)
      );
    }
  }
}