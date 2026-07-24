package com.ssafy.ssasukae.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * STOMP 기반 WebSocket 메시지 브로커 설정 클래스.
 *
 * 클라이언트의 WebSocket 연결 엔드포인트와 메시지 송수신 경로,
 * 하트비트 및 사용자별 메시지 경로를 설정한다.
 */
@Configuration
// Spring에서 STOMP 기반 WebSocket 메시징 기능 활성화 (@MessageMapping, @SendTo, @SendToUser, @SimpMessagingTemplate)
@EnableWebSocketMessageBroker
public class WebSocketMessageBrokerConfig implements WebSocketMessageBrokerConfigurer {

  /**
   * 클라이언트가 최초 WebSocket 연결을 요청하는 엔드포인트. -> 이떄 세션 ID가 만들어짐
   *
   * 예: ws://localhost:8080/ws
   */
  public static final String WEBSOCKET_ENDPOINT = "/ws";

  /**
   * 클라이언트가 서버의 메시지 처리 메서드로 메시지를 보낼 때 사용하는 접두사.
   *
   * 예: SEND /app/rooms/{roomId}/join
   *
   * {@code @MessageMapping}이 선언된 서버 메서드로 전달된다.
   */
  public static final String APPLICATION_DESTINATION_PREFIX = "/app";

  /**
   * 특정 사용자에게 개인 메시지를 전송할 때 사용하는 접두사.
   *
   * 예: SUBSCRIBE /user/queue/errors
   */
  public static final String USER_DESTINATION_PREFIX = "/user";

  /**
   * 여러 구독자에게 브로드캐스트하는 메시지 경로의 접두사.
   *
   * 예: /topic/rooms/{roomId}
   */
  private static final String TOPIC_BROKER_PREFIX = "/topic";

  /**
   * 브로커가 처리할 목적지
   *
   * 예: /user/queue/errors
   */
  private static final String QUEUE_BROKER_PREFIX = "/queue";

  /**
   * STOMP 하트비트 송수신 간격.
   *
   * 10초마다 서버와 클라이언트가 연결 상태를 확인한다.
   */
  private static final long HEARTBEAT_INTERVAL_MILLIS = 10_000L;

  /**
   * WebSocket 연결 시 허용할 Origin 목록을 관리하는 설정 객체.
   */
  private final CorsProperties corsProperties;

  /**
   * STOMP 하트비트 전송 작업을 실행하는 스케줄러.
   */
  private final TaskScheduler heartbeatTaskScheduler;

  /**
   * 주기적으로 웹소켓 연결 확인을 해볼 수 있도록 Task를 호출
   */
  public WebSocketMessageBrokerConfig(
          CorsProperties corsProperties,
          @Qualifier("roomWebSocketHeartbeatTaskScheduler")
          TaskScheduler heartbeatTaskScheduler) {
    this.corsProperties = corsProperties;
    this.heartbeatTaskScheduler = heartbeatTaskScheduler;
  }

  /**
   * STOMP 메시지 브로커와 메시지 경로 규칙을 설정한다.
   *
   * @param registry 메시지 브로커 설정 객체
   */
  @Override
  public void configureMessageBroker(MessageBrokerRegistry registry) {
    registry
            // /topic, /queue로 시작하는 구독 경로를 처리하는 인메모리 단순 브로커를 활성화한다.
            .enableSimpleBroker(TOPIC_BROKER_PREFIX, QUEUE_BROKER_PREFIX)

            // 서버→클라이언트, 클라이언트→서버 하트비트 간격을 각각 10초로 설정한다.
            .setHeartbeatValue(
                    new long[] {
                            HEARTBEAT_INTERVAL_MILLIS,
                            HEARTBEAT_INTERVAL_MILLIS
                    })

            // 하트비트 메시지를 주기적으로 전송할 TaskScheduler를 등록한다.
            .setTaskScheduler(heartbeatTaskScheduler);

    // /app으로 시작하는 클라이언트 메시지를 @MessageMapping 메서드로 전달한다.
    registry.setApplicationDestinationPrefixes(APPLICATION_DESTINATION_PREFIX);

    // 특정 사용자에게 메시지를 전달할 때 사용할 사용자 목적지 접두사를 설정한다.
    registry.setUserDestinationPrefix(USER_DESTINATION_PREFIX);

    /*
     * 같은 세션 또는 동일 목적지로 연속 발행되는 메시지의 순서를 보존한다.
     *
     * 예를 들어 공연 시작 이벤트 다음에 공연 종료 이벤트가 발행된 경우,
     * 가능한 한 발행 순서대로 클라이언트에 전달되도록 한다.
     */
    registry.setPreservePublishOrder(true);
  }

  /**
   * 최초 연결시 클라이언트가 WebSocket 및 STOMP 연결을 시작할 엔드포인트를 등록한다.
   *
   * @param registry STOMP 엔드포인트 설정 객체
   */
  @Override
  public void registerStompEndpoints(StompEndpointRegistry registry) {
    // 클라이언트가 /ws 경로를 통해 WebSocket 연결을 시작할 수 있도록 등록한다.
    var endpointRegistration = registry.addEndpoint(WEBSOCKET_ENDPOINT);

    // application 설정에 등록된 WebSocket 허용 Origin 목록을 조회한다.
    List<String> allowedOrigins = corsProperties.getAllowedOrigins();

    /*
     * 허용 Origin이 설정되어 있을 때만 적용한다.
     *
     * 예:
     * - http://localhost:5173
     * - https://ssasukae.example.com
     */
    if (allowedOrigins != null && !allowedOrigins.isEmpty()) {
      endpointRegistration.setAllowedOrigins(
              allowedOrigins.toArray(String[]::new));
    }
  }
}