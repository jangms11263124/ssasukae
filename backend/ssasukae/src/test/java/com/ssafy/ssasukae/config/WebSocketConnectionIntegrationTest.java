package com.ssafy.ssasukae.config;

import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.security.jwt.ActiveSessionService;
import com.ssafy.ssasukae.global.security.jwt.JwtTokenProvider;
import com.ssafy.ssasukae.support.IntegrationTestSupport;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.AssertionsForClassTypes.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WebSocketConnectionIntegrationTest extends IntegrationTestSupport {

    @LocalServerPort
    int port;

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private JwtTokenProvider jwtTokenProvider;
    @Autowired
    private ActiveSessionService activeSessionService;

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
        String accessToken = issueAccessTokenForNewActiveUser();

        StompHeaders connectHeaders = new StompHeaders();
        connectHeaders.add("Authorization", "Bearer " + accessToken);

        StompSession session =
                stompClient
                        .connectAsync(url, new WebSocketHttpHeaders(), connectHeaders, new StompSessionHandlerAdapter() {})
                        .get(3, TimeUnit.SECONDS);

        assertThat(session.isConnected()).isTrue();

        session.disconnect();
    }

    private String issueAccessTokenForNewActiveUser() {
        User user = userRepository.save(User.builder()
                .email(UUID.randomUUID() + "@test.com")
                .nickname("ws-test-user")
                .provider(OAuthProvider.GOOGLE)
                .providerId(UUID.randomUUID().toString())
                .role(Role.USER)
                .build());

        String sid = UUID.randomUUID().toString();
        activeSessionService.setActiveSession(user.getId(), sid, 60_000L);

        return jwtTokenProvider.createAccessToken(user.getId(), user.getEmail(), user.getRole().name(), sid);
    }
}
