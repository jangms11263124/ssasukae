package com.ssafy.ssasukae.config;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.AssertionsForClassTypes.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WebSocketConnectionIntegrationTest {

    @LocalServerPort
    int port;

    private WebSocketStompClient stompClient;

    @BeforeEach
    void setUp() {
        stompClient =
                new WebSocketStompClient(new StandardWebSocketClient());

        stompClient.setMessageConverter(
                new JacksonJsonMessageConverter());
    }

    @AfterEach
    void tearDown() {
        stompClient.stop();
    }

    @Test
    void connectsToWebSocketEndpoint() throws Exception {
        String url = "ws://localhost:" + port + "/ws";

        StompSession session =
                stompClient
                        .connectAsync(url, new StompSessionHandlerAdapter() {})
                        .get(3, TimeUnit.SECONDS);

        assertThat(session.isConnected()).isTrue();

        session.disconnect();
    }
}
